import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "vitest";
import { filamentPlan, write3mf } from "./threemf";
import type { Model } from "./types";

const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
const model = (...colors: string[]): Model => ({ name: "Placa", parts: colors.map((color, i) => ({ name: `P${i}`, color, mesh })) });
const extruders = (bytes: Uint8Array) => [...strFromU8(unzipSync(bytes)["Metadata/model_settings.config"]).matchAll(/<part[^>]*><metadata key="name" value="[^"]*"\/><metadata key="extruder" value="(\d+)"/g)].map((m) => Number(m[1]));

test("sem AMS: extrusora = posição da cor (como antes)", () => {
  const p = filamentPlan([model("#ffffff", "#2563eb")]);
  expect([p.extruderOf("#ffffff"), p.extruderOf("#2563EB")]).toEqual([1, 2]);
  expect(p.filamentColors).toEqual(["#ffffff", "#2563eb"]);
});

test("com AMS: cor igual vai no slot dela; cor sem slot vai no slot de cor mais parecida (ΔE2000)", () => {
  const slots = ["#1c1c1e", null, "#ffffff", "#c00000"];
  const p = filamentPlan([model("#ffffff", "#e01010")], slots);
  expect(p.extruderOf("#ffffff")).toBe(3);
  expect(p.extruderOf("#e01010")).toBe(4);
  expect(p.moved).toEqual([{ color: "#e01010", slot: 4 }]);
  // um filamento por slot; o vazio leva uma cor neutra
  expect(p.filamentColors).toEqual(["#1c1c1e", "#808080", "#ffffff", "#c00000"]);
  expect(extruders(write3mf([model("#ffffff", "#e01010")], { slots }))).toEqual([3, 4]);
});

test("AMS sem nenhum filamento escolhido: igual a sem AMS", () => {
  expect(filamentPlan([model("#ffffff", "#000000")], [null, null, null, null]).filamentColors).toEqual(["#ffffff", "#000000"]);
});
