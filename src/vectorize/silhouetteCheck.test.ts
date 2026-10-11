import { describe, expect, test } from "vitest";
import { checkSilhouette } from "./silhouetteCheck";

const W = 200, H = 120;
function draw(shapes: [x0: number, y0: number, x1: number, y1: number][]) {
  const m = new Uint8Array(W * H);
  for (const [x0, y0, x1, y1] of shapes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1;
  return m;
}
const kinds = (m: Uint8Array, nozzle = 0.4) => checkSilhouette(m, W, H, nozzle).notes.map((n) => n.kind);

describe("avisos da silhueta (kit card)", () => {
  test("uma figura larga e assimétrica de lado não tem aviso", () => {
    const side = draw([[20, 40, 180, 90], [150, 20, 180, 45], [30, 90, 50, 112]]);
    expect(kinds(side)).toEqual([]);
  });
  test("figura simétrica e mais alta que larga é vista de frente", () => {
    const front = draw([[70, 10, 130, 110]]);
    expect(kinds(front)).toContain("front");
  });
  test("duas figuras grandes viram aviso de várias figuras", () => {
    const r = checkSilhouette(draw([[10, 20, 90, 100], [110, 30, 190, 100]]), W, H, 0.4);
    expect(r.pieces).toBe(2);
    expect(r.notes.map((n) => n.kind)).toContain("many");
  });
  test("uma mancha pequena ao lado não conta como figura", () => {
    expect(checkSilhouette(draw([[10, 20, 150, 100], [170, 50, 176, 56]]), W, H, 0.4).pieces).toBe(1);
  });
  test("contorno fino demais para o bico", () => {
    const outline = draw([[20, 30, 180, 32], [20, 88, 180, 90], [20, 30, 22, 90], [178, 30, 180, 90]]);
    expect(kinds(outline, 0.4)).toContain("thin");
  });
  test("bico maior pede traços mais grossos", () => {
    const frame = draw([[20, 30, 180, 34], [20, 86, 180, 90], [20, 30, 24, 90], [176, 30, 180, 90]]);
    expect(kinds(frame, 0.2)).not.toContain("thin");
    expect(kinds(frame, 0.8)).toContain("thin");
  });
  test("imagem vazia avisa", () => {
    expect(kinds(new Uint8Array(W * H))).toEqual(["empty"]);
  });
});
