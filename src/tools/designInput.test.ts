// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest";
import { loadRaster, trace } from "../vectorize/client";
import { cutout } from "../vectorize/cutout";
import { designFromSvg, fileToCutSvg, fileToSvg, svgWidthMm } from "./designInput";

vi.mock("../vectorize/client", () => ({ loadRaster: vi.fn(), trace: vi.fn() }));
vi.mock("../vectorize/cutout", () => ({ cutout: vi.fn() }));

const RASTER = { rgba: new Uint8ClampedArray(16), w: 2, h: 1, url: "blob:img" };
afterEach(() => vi.restoreAllMocks());

describe("fileToSvg", () => {
  test("SVG (pelo tipo ou pela extensão) passa direto, sem vetorizar", async () => {
    await expect(fileToSvg(new File(["<svg/>"], "a.bin", { type: "image/svg+xml" }))).resolves.toBe("<svg/>");
    await expect(fileToSvg(new File(["<svg/>"], "LOGO.SVG"))).resolves.toBe("<svg/>");
    expect(loadRaster).not.toHaveBeenCalled();
  });

  test("imagem é vetorizada com o padrão (80 mm) e a URL temporária é liberada", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    vi.mocked(loadRaster).mockResolvedValue(RASTER);
    vi.mocked(trace).mockReturnValue({ result: Promise.resolve({ id: 1, type: "done", d: "M0 0L2 0L2 1Z", threshold: 1, fillPct: 1, thinCount: 0, thin: null, ms: 1 }), cancel: () => {} });
    const svg = await fileToSvg(new File(["x"], "foto.png", { type: "image/png" }));
    expect(svg).toMatch(/<svg[^>]*width="80mm"/);
    expect(svg).toContain("M0 0L2 0L2 1Z");
    expect(revoke).toHaveBeenCalledWith("blob:img");
  });

  test("falha na vetorização também libera a URL", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    vi.mocked(loadRaster).mockResolvedValue(RASTER);
    vi.mocked(trace).mockReturnValue({ result: Promise.reject(new Error("falhou")), cancel: () => {} });
    await expect(fileToSvg(new File(["x"], "foto.png", { type: "image/png" }))).rejects.toThrow("falhou");
    expect(revoke).toHaveBeenCalledWith("blob:img");
  });
});

const DONE = { id: 1, type: "done" as const, d: "M0 0L2 0L2 1Z", threshold: 1, fillPct: 1, thinCount: 0, thin: null, ms: 1 };
const CUT = { mask: new Uint8Array([1, 1]), method: "deeplab" as const, confidence: 0.85, uncertain: false, warning: null, coverage: 1, bbox: { x0: 0, y0: 0, x1: 2, y1: 1 } };

describe("fileToCutSvg (recorte do fundo, #193)", () => {
  const png = () => new File(["x"], "aviao.png", { type: "image/png" });

  test("SVG passa direto, sem vetorizar nem recortar", async () => {
    await expect(fileToCutSvg(new File(["<svg/>"], "a.svg", { type: "image/svg+xml" }), { cutout: true })).resolves.toEqual({ svg: "<svg/>", cutout: null });
    expect(cutout).not.toHaveBeenCalled();
    expect(loadRaster).not.toHaveBeenCalled();
  });

  test("sem recorte é a vetorização de sempre, sem aviso", async () => {
    vi.mocked(loadRaster).mockResolvedValue(RASTER);
    vi.mocked(trace).mockReturnValue({ result: Promise.resolve(DONE), cancel: () => {} });
    const out = await fileToCutSvg(png(), { cutout: false });
    expect(out.cutout).toBeNull();
    expect(cutout).not.toHaveBeenCalled();
    expect(vi.mocked(trace).mock.calls[0][2]).toBeNull();
  });

  test("com recorte: a máscara vai para a vetorização em modo silhueta e o aviso volta junto", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    vi.mocked(loadRaster).mockResolvedValue(RASTER);
    vi.mocked(cutout).mockResolvedValue({ ...CUT, uncertain: true, confidence: 0.4, warning: "O fundo da foto não é liso." });
    vi.mocked(trace).mockReturnValue({ result: Promise.resolve(DONE), cancel: () => {} });
    const out = await fileToCutSvg(png(), { cutout: true });
    expect(cutout).toHaveBeenCalledWith(RASTER.rgba, 2, 1);
    const [, options, mask] = vi.mocked(trace).mock.calls[0];
    expect(options.mode).toBe("silhouette");
    expect(mask).toBe(CUT.mask);
    expect(out.svg).toMatch(/<svg[^>]*width="80mm"/);
    expect(out.cutout).toEqual({ method: "deeplab", confidence: 0.4, uncertain: true, warning: "O fundo da foto não é liso." });
    expect(Object.keys(out.cutout!)).not.toContain("mask");
    expect(revoke).toHaveBeenCalledWith("blob:img");
  });

  test("o recorte quebrou: vetoriza a foto inteira, avisa e libera a URL", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(loadRaster).mockResolvedValue(RASTER);
    vi.mocked(cutout).mockRejectedValue(new Error("boom"));
    vi.mocked(trace).mockReturnValue({ result: Promise.resolve(DONE), cancel: () => {} });
    const out = await fileToCutSvg(png(), { cutout: true });
    expect(out.cutout).toMatchObject({ uncertain: true, warning: expect.stringMatching(/recortar/) });
    expect(vi.mocked(trace).mock.calls[0][2]).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:img");
  });
});

test("svgWidthMm lê width em mm da tag <svg>; outras unidades não contam", () => {
  expect(svgWidthMm('<svg xmlns="x" width="42.5mm" height="10mm">')).toBe(42.5);
  expect(svgWidthMm('<svg width="100" height="10">')).toBeNull();
  expect(svgWidthMm('<rect width="10mm"/>')).toBeNull();
});

test("designFromSvg ajusta à largura pedida; espelhar mantém o tamanho", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><polygon points="0,0 20,0 0,10"/></svg>';
  for (const mirror of [false, true]) {
    const { cs } = await designFromSvg(svg, 50, mirror);
    const b = cs.bounds();
    expect(b.max[0] - b.min[0]).toBeCloseTo(50, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(25, 1);
    cs.delete();
  }
});
