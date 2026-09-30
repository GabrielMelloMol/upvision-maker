import { expect, test } from "vitest";
import { bambuObjectSettings, profileSummary } from "../../geometry/printProfile";
import { MODELS } from "./defs";
import { MODEL_PROFILES, profileFor } from "./printProfiles";

test("perfis por modelo: só ids que existem no catálogo", () => {
  const ids = new Set(MODELS.map((m) => m.id));
  expect(Object.keys(MODEL_PROFILES).filter((id) => !ids.has(id))).toEqual([]);
});

test("modelo com campo de altura de camada: o fatiador usa a mesma camada (pausa no lugar)", () => {
  expect(profileFor("nfc", { layerHeight: 0.16 }).layerHeight).toBe(0.16);
  expect(profileFor("opener", {})).toMatchObject({ layerHeight: 0.2, walls: 4, infill: 40, support: false });
  expect(profileFor("desconhecido", {})).toMatchObject({ layerHeight: 0.2, walls: 3, infill: 15 });
});

test("vaso em modo espiral liga o modo vaso no 3MF; com paredes fica o padrão (#92)", () => {
  const spiral = profileFor("vase", { mode: "spiral" });
  expect(spiral).toMatchObject({ spiral: true, walls: 1, infill: 0 });
  expect(bambuObjectSettings(spiral)).toContainEqual(["spiral_mode", "1"]);
  expect(profileSummary(spiral)).toMatch(/^modo vaso \(espiral\)/);
  expect(profileFor("vase", { mode: "walls" }).spiral).toBeUndefined();
});
