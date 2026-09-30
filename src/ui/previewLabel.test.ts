import { expect, test } from "vitest";
import { previewLabel } from "./Preview3D";

test("prévia 3D para leitor de tela (#144): medidas em mm, partes e o estado quando não há peça", () => {
  expect(previewLabel({ x: 42.5, y: 20, z: 3.4 }, ["Base", "Texto"], null)).toBe("Prévia 3D: 42,5 × 20,0 × 3,4 mm; partes Base, Texto");
  expect(previewLabel({ x: 10, y: 10, z: 2 }, ["Peça"], null)).toBe("Prévia 3D: 10,0 × 10,0 × 2,0 mm");
  expect(previewLabel(null, [], null)).toBe("Prévia 3D vazia");
  expect(previewLabel(null, [], "Gerando chaveiros…")).toBe("Prévia 3D: Gerando chaveiros…");
});
