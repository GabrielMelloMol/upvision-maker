// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loadRaster, trace, TraceCancelled, type Raster } from "./client";
import { DEFAULT_TRACE } from "./pipeline";
import type { TraceMessage, TraceRequest } from "./vectorize.worker";

/** Worker falso: guarda as mensagens recebidas e deixa o teste responder. */
class FakeWorker extends EventTarget {
  static all: FakeWorker[] = [];
  sent: TraceRequest[] = [];
  terminated = false;
  constructor() {
    super();
    FakeWorker.all.push(this);
  }
  postMessage(m: TraceRequest) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(m: TraceMessage) {
    this.dispatchEvent(new MessageEvent("message", { data: m }));
  }
  crash(message: string) {
    const e = new Event("error") as Event & { message: string };
    e.message = message;
    this.dispatchEvent(e);
  }
}

const R: Raster = { rgba: new Uint8ClampedArray(16), w: 2, h: 2, url: "blob:x" };
const last = () => FakeWorker.all.at(-1)!;

// O worker é um singleton do módulo: `last()` é sempre o worker em uso.
beforeEach(() => {
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("trace (worker de vetorização)", () => {
  test("repassa progresso, ignora mensagens de outro pedido e resolve com o resultado; reaproveita o worker", async () => {
    const progress = vi.fn();
    const seg = new Uint8Array([1, 0, 1, 0]);
    const job = trace(R, DEFAULT_TRACE, seg, progress);
    const w = last();
    const req = w.sent[0];
    expect(req).toMatchObject({ w: 2, h: 2, options: DEFAULT_TRACE });
    expect(req.rgba).not.toBe(R.rgba); // cópia (o buffer vai para o worker)
    expect(req.seg).toEqual(seg);

    w.reply({ id: req.id + 99, type: "done", d: "outro", threshold: 0, fillPct: 0, thinCount: 0, thin: null, ms: 0 });
    w.reply({ id: req.id, type: "progress", stage: "trace", ticks: 5 });
    w.reply({ id: req.id, type: "done", d: "M0 0Z", threshold: 120, fillPct: 50, thinCount: 0, thin: null, ms: 3 });
    await expect(job.result).resolves.toMatchObject({ d: "M0 0Z", threshold: 120 });
    expect(progress).toHaveBeenCalledWith({ stage: "trace", ticks: 5 });

    const again = trace(R, DEFAULT_TRACE, null);
    expect(last()).toBe(w);
    expect(w.sent[1].seg).toBeNull();
    w.reply({ id: w.sent[1].id, type: "done", d: "", threshold: 0, fillPct: 0, thinCount: 0, thin: null, ms: 0 });
    await again.result;
    expect(w.terminated).toBe(false);
  });

  test("erro do pipeline rejeita e descarta o worker (o próximo pedido cria outro)", async () => {
    const job = trace(R, DEFAULT_TRACE, null);
    const w = last();
    w.reply({ id: w.sent.at(-1)!.id, type: "error", error: "sem forma" });
    await expect(job.result).rejects.toThrow("sem forma");
    expect(w.terminated).toBe(true);
    const n = FakeWorker.all.length;
    const next = trace(R, DEFAULT_TRACE, null);
    expect(FakeWorker.all).toHaveLength(n + 1);
    next.cancel();
    await expect(next.result).rejects.toBeInstanceOf(TraceCancelled);
  });

  test("falha ao carregar o worker: mensagem do evento ou texto padrão", async () => {
    const a = trace(R, DEFAULT_TRACE, null);
    last().crash("wasm quebrou");
    await expect(a.result).rejects.toThrow("wasm quebrou");
    const b = trace(R, DEFAULT_TRACE, null);
    last().crash("");
    await expect(b.result).rejects.toThrow("Falha no motor de vetorização.");
  });

  test("cancelar rejeita com TraceCancelled e encerra o worker na hora", async () => {
    const job = trace(R, DEFAULT_TRACE, null);
    job.cancel();
    await expect(job.result).rejects.toBeInstanceOf(TraceCancelled);
    expect(last().terminated).toBe(true);
  });

  test("demora demais: rejeita com mensagem de tempo esgotado", async () => {
    vi.useFakeTimers();
    const job = trace(R, DEFAULT_TRACE, null);
    const assertion = expect(job.result).rejects.toThrow(/demorou demais/);
    vi.advanceTimersByTime(120_001);
    await assertion;
  });
});

describe("loadRaster", () => {
  test("recusa imagem acima de 25 MB", async () => {
    await expect(loadRaster(new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]), () => 1)).rejects.toThrow("Imagem maior que 25 MB.");
  });

  test("imagem que não decodifica: mensagem com os formatos aceitos", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("decode")));
    await expect(loadRaster(new Blob(["x"]), () => 1)).rejects.toThrow(/Use PNG, JPG, WebP/);
  });

  test("reamostra na escala pedida (mín. 1 px), com suavização alta, e fecha o bitmap", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", async () => ({ width: 100, height: 3, close }));
    const ctx = { drawImage: vi.fn(), getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), imageSmoothingEnabled: false, imageSmoothingQuality: "low" };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const r = await loadRaster(new Blob(["x"], { type: "image/png" }), () => 0.1);
    expect([r.w, r.h]).toEqual([10, 1]);
    expect(r.rgba).toHaveLength(10 * 1 * 4);
    expect(r.url).toMatch(/^blob:/);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 10, 1);
    expect(ctx.imageSmoothingQuality).toBe("high");
    expect(close).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
