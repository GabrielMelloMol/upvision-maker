import { expect, test } from "vitest";
import type { Mesh, Model } from "../../geometry/types";
import { bedWarnings, withBedCheck } from "./bedCheck";
import type { ModelDef } from "./fields";

/** Caixa [0,w]×[0,d]×[0,h] (só os 8 cantos bastam para os limites). */
const box = (w: number, d: number, h: number): Mesh => ({
  positions: Float32Array.from([0, 0, 0, w, 0, 0, 0, d, 0, w, d, 0, 0, 0, h, w, 0, h, 0, d, h, w, d, h]),
  indices: new Uint32Array([0, 1, 2]),
});
const model = (name: string, m: Mesh): Model => ({ name, parts: [{ name, color: "#000000", mesh: m }] });

test("avisa a peça que passa da mesa na largura ou na altura; nada quando cabe", () => {
  expect(bedWarnings([model("Placa", box(200, 100, 3))], [])).toEqual([]);
  expect(bedWarnings([model("Coração", box(276, 249, 3))], [])[0]).toMatch(/"Coração" tem 276 × 249 × 3 mm e passa da mesa de 256 mm/);
  expect(bedWarnings([model("Vaso", box(100, 100, 300))], [])[0]).toMatch(/altura de 256 mm/);
});

test("modelo só de prévia (previewOnly) não entra na conta da mesa", () => {
  const preview: Model = { ...model("Montado", box(400, 400, 3)), previewOnly: true };
  expect(bedWarnings([model("Cartão", box(100, 100, 2)), preview], [])).toEqual([]);
});

test("withBedCheck não rearruma nem conta o modelo só de prévia: ele fica onde o modelo o pôs", () => {
  const card = model("Cartão", box(180, 120, 2));
  const preview: Model = { ...model("Montado", box(70, 40, 20)), previewOnly: true };
  const moved = { ...preview, parts: preview.parts.map((q) => ({ ...q, mesh: { ...q.mesh, positions: q.mesh.positions.map((v, i) => (i % 3 === 0 ? v + 200 : v)) } })) };
  const def = { id: "x", build: () => ({ models: [card, moved], warnings: [] }) } as unknown as ModelDef;
  const out = withBedCheck(def).build({} as never, {});
  expect(out.models).toHaveLength(2);
  expect(out.models[1].previewOnly).toBe(true);
  expect(out.models[1].parts[0].mesh.positions).toEqual(moved.parts[0].mesh.positions); // não foi arrumado para outro canto
  expect(out.warnings).toEqual([]); // 180 + 200 passa de 256, mas a prévia não conta
});

test("não repete quando o modelo já avisou da mesa", () => {
  expect(bedWarnings([model("Placa", box(300, 100, 3))], ["A peça tem 300 mm e passa da mesa de 256 mm."])).toEqual([]);
});

test("withBedCheck acrescenta o aviso à saída do modelo", () => {
  const def = { id: "x", build: () => ({ models: [model("Placa", box(300, 10, 3))], warnings: ["outro"] }) } as unknown as ModelDef;
  const out = withBedCheck(def).build({} as never, {});
  expect(out.warnings).toHaveLength(2);
});
