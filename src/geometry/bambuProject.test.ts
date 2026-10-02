import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { withFilamentColors } from "./bambuProject";

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
