import { expect, test } from "vitest";
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
