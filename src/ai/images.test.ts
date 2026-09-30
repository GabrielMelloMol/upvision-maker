// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest";
import { estimateInputCostUsd } from "./cost";
import { fitSize, prepareImage, userContent, type RefImage } from "./images";

const img = (caption = "", id = "a"): RefImage => ({ id, name: `${id}.jpg`, mediaType: "image/jpeg", data: "QUJD", width: 10, height: 10, caption });

afterEach(() => vi.unstubAllGlobals());

describe("imagens de referência (#89)", () => {
  test("fitSize reduz o lado maior para 1568 px e mantém a proporção; imagem pequena fica igual", () => {
    expect(fitSize(4032, 3024)).toEqual([1568, 1176]);
    expect(fitSize(1000, 3000)).toEqual([523, 1568]);
    expect(fitSize(800, 600)).toEqual([800, 600]);
  });

  test("userContent: sem imagem é só o texto; com imagens, cada uma com a legenda antes, e o texto no fim", () => {
    expect(userContent("cubo", [])).toBe("cubo");
    expect(userContent("igual a estas", [img("vista de cima", "a"), img("", "b")])).toEqual([
      { type: "text", text: "Imagem 1: vista de cima" },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } },
      { type: "text", text: "Imagem 2" },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } },
      { type: "text", text: "igual a estas" },
    ]);
  });

  test("prepareImage recusa o que não é imagem, arquivo grande e HEIC que o sistema não abre", async () => {
    await expect(prepareImage(new File(["x"], "nota.txt", { type: "text/plain" }))).rejects.toThrow(/não é uma imagem/);
    const big = new File([new Uint8Array(26 * 1024 * 1024)], "grande.jpg", { type: "image/jpeg" });
    await expect(prepareImage(big)).rejects.toThrow(/mais de 25 MB/);
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("heic")));
    await expect(prepareImage(new File(["x"], "foto.HEIC", { type: "" }))).rejects.toThrow(/não abre HEIC.*JPG/);
  });

  test("prepareImage reduz e devolve base64 sem o prefixo data:", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 3136, height: 1568, close() {} }));
    const draws: number[][] = [];
    const ctx = { fillRect() {}, drawImage: (_b: unknown, ...a: number[]) => draws.push(a), fillStyle: "" };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,QUJD");
    try {
      const r = await prepareImage(new File(["x"], "peca.jpg", { type: "image/jpeg" }));
      expect(r).toMatchObject({ mediaType: "image/jpeg", data: "QUJD", width: 1568, height: 784, caption: "" });
      expect(draws[0]).toEqual([0, 0, 1568, 784]);
    } finally {
      getContext.mockRestore();
      toDataURL.mockRestore();
    }
  });

  test("custo só da entrada, antes de enviar", () => {
    expect(estimateInputCostUsd("claude-sonnet-5", 1_000_000)).toBeCloseTo(2);
    expect(estimateInputCostUsd("modelo-x", 10)).toBeNull();
  });
});
