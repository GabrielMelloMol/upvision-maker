import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { platesOf, withFilamentColors, withPlates } from "./bambuProject";

const SETTINGS = "Metadata/project_settings.config";
// como o CLI do Bambu Studio 02.08 exporta o projeto: 1 cor e a matriz de purga 4×4 do perfil, qualquer que seja o nº de filamentos
const exported = () =>
  zipSync({
    [SETTINGS]: strToU8(JSON.stringify({ filament_colour: ["#00AE42"], filament_map: ["1"], flush_volumes_matrix: ["0", "280", "280", "280", "280", "0", "280", "280", "280", "280", "0", "280", "280", "280", "280", "0"] })),
  });
const settings = (p: Uint8Array) => JSON.parse(strFromU8(unzipSync(p)[SETTINGS])) as Record<string, string[]>;

describe("withFilamentColors (#90)", () => {
  test("troca as cores e acerta a matriz de purga e o mapa para N filamentos (senão o Bambu não fatia: -100)", () => {
    const s = settings(withFilamentColors(exported(), ["#ffffff", "#000000"]));
    expect(s.filament_colour).toEqual(["#FFFFFF", "#000000"]);
    expect(s.flush_volumes_matrix).toEqual(["0", "280", "280", "0"]);
    expect(s.filament_map).toEqual(["1", "1"]);
  });

  test("3 filamentos: matriz 3×3 com zero na diagonal", () => {
    const s = settings(withFilamentColors(exported(), ["#f00", "#0f0", "#00f"]));
    expect(s.flush_volumes_matrix).toEqual(["0", "280", "280", "280", "0", "280", "280", "280", "0"]);
  });

  test("sem cores devolve o projeto como veio", () => {
    const p = exported();
    expect(withFilamentColors(p, [])).toBe(p);
  });
});

describe("withPlates (#293)", () => {
  // o que o CLI exporta: todos os objetos na mesa 1, achados pelo nome no model_settings.config
  const cfg = `<config>
  <object id="2">
    <metadata key="name" value="Caixinha"/>
  </object>
  <object id="4">
    <metadata key="name" value="Cabo"/>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <model_instance>
      <metadata key="object_id" value="2"/>
      <metadata key="instance_id" value="0"/>
    </model_instance>
    <model_instance>
      <metadata key="object_id" value="4"/>
      <metadata key="instance_id" value="0"/>
    </model_instance>
  </plate>
</config>`;
  const model = `<build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 120 0" printable="1"/><item objectid="4" transform="1 0 0 0 1 0 0 0 1 150 120 0" printable="1"/></build>`;
  const project = zipSync({ "Metadata/model_settings.config": strToU8(cfg), "3D/3dmodel.model": strToU8(model) });

  test("cada objeto vai para a mesa dele: sai da mesa 1, ganha a mesa 2 e anda até ela (1,2 × a largura da mesa)", () => {
    const out = unzipSync(withPlates(project, { Caixinha: 1, Cabo: 2 }));
    const c = strFromU8(out["Metadata/model_settings.config"]);
    const plates = [...c.matchAll(/<plate>([\s\S]*?)<\/plate>/g)].map((m) => [m[1].match(/plater_id" value="(\d)"/)![1], [...m[1].matchAll(/object_id" value="(\d+)"/g)].map((x) => x[1])]);
    expect(plates).toEqual([["1", ["2"]], ["2", ["4"]]]);
    const m = strFromU8(out["3D/3dmodel.model"]);
    expect(m).toContain('<item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 120 0"');
    expect(m).toContain(`<item objectid="4" transform="1 0 0 0 1 0 0 0 1 ${150 + 256 * 1.2} 120 0"`);
  });

  test("modelo de uma mesa só: o projeto não muda", () => {
    expect(withPlates(project, platesOf([{ name: "Caixinha", parts: [] }]))).toBe(project);
    expect(platesOf([{ name: "A", parts: [], plate: 1 }, { name: "B", parts: [], plate: 2 }])).toEqual({ A: 1, B: 2 });
  });
});
