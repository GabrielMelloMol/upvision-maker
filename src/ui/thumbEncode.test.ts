// @vitest-environment happy-dom
import { expect, test, vi } from "vitest";
import { encodeThumb } from "./thumbEncode";

/** B22: o WebKit (Mac) não codifica WebP em toDataURL e devolve PNG, bem maior; nesse caso a miniatura sai em JPEG. */
const fakeCanvas = (supportsWebp: boolean) => {
  const calls: string[] = [];
  const ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  const canvas = {
    width: 200,
    height: 100,
    getContext: () => ctx,
    toDataURL: (type: string) => {
      calls.push(type);
      return type === "image/webp" && supportsWebp ? "data:image/webp;base64,AAA" : type === "image/jpeg" ? "data:image/jpeg;base64,BBB" : "data:image/png;base64,CCC";
    },
  } as unknown as HTMLCanvasElement;
  return { canvas, calls, ctx };
};

test("com WebP disponível, usa WebP", () => {
  const { canvas, calls } = fakeCanvas(true);
  expect(encodeThumb(canvas, 0.7, "#fff")).toBe("data:image/webp;base64,AAA");
  expect(calls).toEqual(["image/webp"]);
});

test("sem WebP (devolveu PNG), refaz em JPEG sobre o fundo, em vez de gravar o PNG pesado", () => {
  const src = fakeCanvas(false);
  const flat = fakeCanvas(false); // o canvas novo, onde o JPEG é montado
  vi.spyOn(document, "createElement").mockReturnValue(flat.canvas);
  const url = encodeThumb(src.canvas, 0.7, "#f4f4f6");
  expect(url).toBe("data:image/jpeg;base64,BBB");
  expect(src.calls).toEqual(["image/webp"]); // o original só tentou WebP
  expect(flat.calls).toEqual(["image/jpeg"]);
  expect(flat.ctx.fillStyle).toBe("#f4f4f6"); // o fundo entra por baixo: JPEG não tem transparência
  expect(flat.ctx.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
  expect(flat.ctx.drawImage).toHaveBeenCalledWith(src.canvas, 0, 0);
  vi.restoreAllMocks();
});
