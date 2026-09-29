import { expect, test } from "vitest";
import { modelsBounds } from "../../geometry/bounds";
import type { Model } from "../../geometry/types";
import { BATCH_FIELDS, layoutCopies, parseBatch } from "./batch";
import { MODELS } from "./defs";

const box = (w: number, h: number, name = "p"): Model => ({
  name,
  parts: [{ name, color: "#fff", mesh: { positions: new Float32Array([0, 0, 0, w, 0, 0, w, h, 0, 0, h, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) } }],
});

test("parseBatch: uma cópia por linha, campos por ';', faltando fica vazio", () => {
  expect(parseBatch("Ana; 11 9999\n\n  Bia  \n", ["name", "phone"])).toEqual([
    { name: "Ana", phone: "11 9999" },
    { name: "Bia", phone: "" },
  ]);
  expect(parseBatch("", ["name"])).toEqual([]);
});

test("todo campo de lote existe como campo de texto no modelo", () => {
  for (const [id, keys] of Object.entries(BATCH_FIELDS)) {
    const def = MODELS.find((m) => m.id === id);
    expect(def, id).toBeDefined();
    const texts = def!.sections.flatMap((s) => s.fields).filter((f) => f.kind === "text").map((f) => f.k);
    for (const k of keys) expect(texts, `${id}.${k}`).toContain(k);
  }
});

test("layoutCopies: peças da mesma cópia andam juntas, cópias não se sobrepõem, avisa quando não cabe", () => {
  const copy = (label: string) => ({ label, models: [box(40, 20, "letra"), { ...box(10, 10, "nome"), parts: box(10, 10, "nome").parts.map((q) => ({ ...q, mesh: { ...q.mesh, positions: q.mesh.positions.map((v, i) => (i % 3 === 0 ? v + 45 : v)) } })) }] });
  const { models, fits } = layoutCopies([copy("Ana"), copy("Bia"), copy("Caio")]);
  expect(fits).toBe(true);
  expect(models.map((m) => m.name)).toEqual(["Ana · letra", "Ana · nome", "Bia · letra", "Bia · nome", "Caio · letra", "Caio · nome"]);
  // a peça "nome" continua 45 mm à direita da "letra" da mesma cópia
  expect(modelsBounds([models[1]])!.min[0] - modelsBounds([models[0]])!.min[0]).toBeCloseTo(45);
  const blocks = [0, 2, 4].map((i) => modelsBounds(models.slice(i, i + 2))!);
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) {
      const a = blocks[i], b = blocks[j];
      expect(a.min[0] < b.max[0] && b.min[0] < a.max[0] && a.min[1] < b.max[1] && b.min[1] < a.max[1]).toBe(false);
    }
  expect(layoutCopies(Array.from({ length: 40 }, (_, i) => ({ label: `${i}`, models: [box(60, 60)] }))).fits).toBe(false);
  expect(layoutCopies([{ label: "só", models: [box(10, 10)] }]).models[0].name).toBe("só");
});
