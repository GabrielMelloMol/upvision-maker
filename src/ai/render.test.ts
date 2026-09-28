import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { writeStl } from "../geometry/stl";
import type { Mesh } from "../geometry/types";
import type { ScadRequest, ScadResponse } from "./openscad.worker";
import { RenderCancelled, renderScad } from "./render";

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((e: { data: ScadResponse }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  sent: ScadRequest[] = [];
  terminated = false;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(m: ScadRequest) {
    this.sent.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  reply(r: ScadResponse) {
    this.onmessage?.({ data: r });
  }
}

const TRI: Mesh = { positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]) };
const stl = () => writeStl([{ name: "x", parts: [{ name: "x", color: "#000000", mesh: TRI }] }]);
const TWO_PARTS = "// @part base #112233 Base\n// @part topo #FFFFFF Topo\nmodule base() { cube(1); }\nmodule topo() { cube(2); }";

beforeEach(() => vi.stubGlobal("Worker", FakeWorker));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("renderScad", () => {
  test("com @part: um programa por parte; cada STL vira uma parte com nome e cor", async () => {
    const job = renderScad(TWO_PARTS, "Porta-copos");
    const w = FakeWorker.last;
    const { id, programs } = w.sent[0];
    expect(programs).toHaveLength(2);
    expect(programs[0].trim().endsWith("base();")).toBe(true);
    expect(programs[1].trim().endsWith("topo();")).toBe(true);
    w.reply({ id: id + 1, ok: true, stls: [], ms: 0 }); // outro pedido: ignora
    w.reply({ id, ok: true, stls: [stl(), stl()], ms: 5 });
    const m = await job.result;
    expect(m.name).toBe("Porta-copos");
    expect(m.parts.map((p) => [p.name, p.color])).toEqual([
      ["Base", "#112233"],
      ["Topo", "#ffffff"],
    ]);
    expect(m.parts[0].mesh.indices).toHaveLength(3);
    expect(w.terminated).toBe(true);
  });

  test("sem @part: o código inteiro é uma peça azul", async () => {
    const job = renderScad("cube(5);", "Peça");
    const w = FakeWorker.last;
    expect(w.sent[0].programs).toEqual(["cube(5);"]);
    w.reply({ id: w.sent[0].id, ok: true, stls: [stl()], ms: 1 });
    expect((await job.result).parts).toMatchObject([{ name: "Peça", color: "#2563eb" }]);
  });

  test("erro do OpenSCAD e falha ao carregar o worker viram mensagens", async () => {
    const a = renderScad("cube(", "x");
    FakeWorker.last.reply({ id: FakeWorker.last.sent[0].id, ok: false, error: "syntax error" });
    await expect(a.result).rejects.toThrow("syntax error");
    const b = renderScad("cube(1);", "x");
    FakeWorker.last.onerror!({ message: "" });
    await expect(b.result).rejects.toThrow("Falha ao carregar o OpenSCAD.");
    expect(FakeWorker.last.terminated).toBe(true);
  });

  test("cancelar e tempo esgotado", async () => {
    const a = renderScad("cube(1);", "x");
    a.cancel();
    await expect(a.result).rejects.toBeInstanceOf(RenderCancelled);
    vi.useFakeTimers();
    const b = renderScad("cube(1);", "x");
    const done = expect(b.result).rejects.toThrow(/mais de 90 s/);
    vi.advanceTimersByTime(90_001);
    await done;
  });
});
