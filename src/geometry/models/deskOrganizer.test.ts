import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { buildDeskOrganizer, DEFAULT_DESK_ORGANIZER as D, parseWidths, type DeskOrganizerParams } from "./deskOrganizer";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const build = (p: Partial<DeskOrganizerParams> = {}) => buildDeskOrganizer(ctx(), { ...D, ...p });
const bodyVol = (p: Partial<DeskOrganizerParams>) => volume(build(p).models[0].parts[0].mesh);

test("parseWidths aceita vírgula ou espaço, ignora lixo e limita a 5", () => {
  expect(parseWidths("1, 1, 2")).toEqual([1, 1, 2]);
  expect(parseWidths("1 x 2;3,,")).toEqual([1, 2, 3]);
  expect(parseWidths("1,1,1,1,1,1,1")).toHaveLength(5);
});

describe("organizador de mesa (#51)", { timeout: 30_000 }, () => {
  test("fila: tamanho externo, compartimentos ocos e nome de pé na frente, em outra cor", () => {
    const { models, warnings } = build();
    expect(warnings).toEqual([]);
    const [body, name] = models[0].parts;
    const b = meshBounds([body.mesh])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(D.length, 1);
    expect(b.max[2]).toBeCloseTo(D.height);
    // volume = caixa cheia − compartimentos (área interna menos 2 divisórias) × (altura − fundo)
    const cavity = (D.length - 2 * D.wall - 2 * D.wall) * (D.depth - 2 * D.wall) * (D.height - D.floor);
    expect(volume(body.mesh)).toBeCloseTo(D.length * D.depth * D.height - cavity - (4 - Math.PI) * 16 * D.height, -2);
    expect(name.color).toBe(D.nameColor);
    const nb = meshBounds([name.mesh])!;
    expect(nb.max[1]).toBeCloseTo(-D.depth / 2, 3); // encostado na frente
    expect(nb.min[1]).toBeCloseTo(-D.depth / 2 - D.relief, 3);
    expect((nb.min[2] + nb.max[2]) / 2).toBeCloseTo(D.height / 2, 3);
  });

  test("mais divisões = mais parede; grade com drenagem tira os furos do fundo", () => {
    expect(bodyVol({ widths: "1,1,1,1" })).toBeGreaterThan(bodyVol({ widths: "1,1" }));
    const grid = bodyVol({ mode: "grid" }), drained = bodyVol({ mode: "grid", drain: true });
    expect(grid - drained).toBeCloseTo(6 * Math.PI * 4 * D.floor, -1);
  });

  test("avisos: larguras inválidas e compartimento estreito demais", () => {
    expect(build({ widths: "abc" }).warnings!.join(" ")).toMatch(/Larguras inválidas/);
    expect(build({ mode: "grid", cols: 12, length: 100 }).warnings!.join(" ")).toMatch(/menos de 1 cm/);
  });
});
