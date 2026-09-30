import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "vitest";
import { bambuObjectSettings, DEFAULT_PROFILE, mergeProfiles, profileSummary } from "./printProfile";
import { write3mf } from "./threemf";

const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) };

test("chaves do Bambu/Orca por objeto, só as definidas", () => {
  expect(bambuObjectSettings({ layerHeight: 0.12, walls: 4, infill: 100, support: false, brim: true })).toEqual([
    ["layer_height", "0.12"],
    ["wall_loops", "4"],
    ["sparse_infill_density", "100%"],
    ["enable_support", "0"],
    ["brim_type", "outer_only"],
    ["brim_width", "5"],
  ]);
  expect(bambuObjectSettings({})).toEqual([]);
});

test("resumo para a tela e junção de perfis (notas somam)", () => {
  expect(profileSummary(DEFAULT_PROFILE)).toBe("camada 0,2 mm · 3 paredes · 15% de preenchimento · sem suporte");
  expect(mergeProfiles({ ...DEFAULT_PROFILE, notes: ["a"] }, { infill: 100, notes: ["b"] })).toMatchObject({ infill: 100, walls: 3, notes: ["a", "b"] });
});

test("3MF leva o perfil em cada objeto; sem perfil, nada muda", () => {
  const f = write3mf([{ name: "A", parts: [{ name: "a", color: "#000000", mesh }] }, { name: "B", parts: [{ name: "b", color: "#000000", mesh }] }], { profile: { layerHeight: 0.12, infill: 40 } });
  const cfg = strFromU8(unzipSync(f)["Metadata/model_settings.config"]);
  expect(cfg.match(/key="layer_height" value="0.12"/g)).toHaveLength(2);
  expect(cfg).toContain('key="sparse_infill_density" value="40%"');
  expect(strFromU8(unzipSync(write3mf([{ name: "A", parts: [{ name: "a", color: "#000000", mesh }] }]))["Metadata/model_settings.config"])).not.toContain("layer_height");
});
