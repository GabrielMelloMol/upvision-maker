// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { logoToDataUrl, photoToDataUrl } from "./photo";

type Ctx = { fillStyle: string; imageSmoothingQuality: string; fillRect: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };
let ctx: Ctx;
let canvases: HTMLCanvasElement[];
let close: ReturnType<typeof vi.fn>;

const bitmap = (width: number, height: number) => {
  close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width, height, close })));
};

beforeEach(() => {
  ctx = { fillStyle: "", imageSmoothingQuality: "", fillRect: vi.fn(), drawImage: vi.fn() };
  canvases = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    canvases.push(this);
    return ctx as unknown as CanvasRenderingContext2D;
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation((type?: string, q?: unknown) => `data:${type};q=${q}`);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const file = (bytes = 10) => new File([new Uint8Array(bytes)], "f.png", { type: "image/png" });

test("foto grande vira JPEG de até 1024 px no lado maior, com fundo branco", async () => {
  bitmap(4000, 2000);
  expect(await photoToDataUrl(file())).toBe("data:image/jpeg;q=0.82");
  expect([canvases[0].width, canvases[0].height]).toEqual([1024, 512]);
  expect(ctx.fillStyle).toBe("#fff");
  expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1024, 512);
  expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 512);
  expect(close).toHaveBeenCalled();
});

test("foto pequena não é ampliada", async () => {
  bitmap(300, 200);
  await photoToDataUrl(file());
  expect([canvases[0].width, canvases[0].height]).toEqual([300, 200]);
});

test("logo vira PNG de até 600 px, sem fundo (mantém transparência)", async () => {
  bitmap(1200, 1200);
  expect(await logoToDataUrl(file())).toBe("data:image/png;q=0.82");
  expect([canvases[0].width, canvases[0].height]).toEqual([600, 600]);
  expect(ctx.fillRect).not.toHaveBeenCalled();
});

test("arquivo acima de 25 MB é recusado antes de abrir", async () => {
  bitmap(10, 10);
  const big = file();
  Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 + 1 });
  await expect(photoToDataUrl(big)).rejects.toThrow("Foto maior que 25 MB.");
  expect(createImageBitmap).not.toHaveBeenCalled();
});

test("imagem que o navegador não abre dá erro em português", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("decode"))));
  await expect(photoToDataUrl(file())).rejects.toThrow("Não consegui abrir esta imagem.");
});
