import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import { MissingInput, type ModelCtx } from "./common";
import { buildStarMap, DEFAULT_STAR_MAP as D, starDiameter, type StarMapParams } from "./starMap";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** "Fonte" de teste: cada letra vira um bloco 0,5·h × h. */
const ctx = (): ModelCtx => ({ M, art: null, artLayers: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.5 * h * s.length, h], true) : null) });
const build = (p: Partial<StarMapParams> = {}) => buildStarMap(ctx(), { ...D, ...p });
const part = (out: ReturnType<typeof build>, name: string) => out.models[0].parts.find((x) => x.name === name)!.mesh;
const H = D.width * 1.3;

describe("mapa estelar de uma data (#106)", { timeout: 60_000 }, () => {
  test("placa na largura pedida e 30% mais alta para o texto; estrelas em relevo sobre ela, 2 cores", () => {
    const out = build();
    const plate = meshBounds([part(out, "Placa")])!;
    expect(plate.max[0] - plate.min[0]).toBeCloseTo(D.width, 1);
    expect(plate.max[1] - plate.min[1]).toBeCloseTo(H, 1);
    expect(plate.min[2]).toBeCloseTo(0);
    expect(plate.max[2]).toBeCloseTo(D.thickness);
    const marks = meshBounds([part(out, "Estrelas")])!;
    expect(marks.min[2]).toBeCloseTo(D.thickness);
    expect(marks.max[2]).toBeCloseTo(D.thickness + D.relief);
    expect(out.models[0].parts.map((x) => x.color)).toEqual([D.plateColor, D.starColor]);
  });

  test("volume da placa: retângulo arredondado × espessura (suporte de mesa, sem ímã)", () => {
    const r = D.width * 0.05;
    expect(volume(part(build(), "Placa"))).toBeCloseTo((D.width * H - (4 - Math.PI) * r * r) * D.thickness, -2);
  });

  test("o céu cabe no círculo do aro, em cima, centrado na largura; o aro fecha a 1 mm", () => {
    const b = meshBounds([part(build({ title: "" }), "Estrelas")])!;
    const R = D.width / 2 - 6;
    expect(b.max[0]).toBeCloseTo(R + 1, 1); // o aro
    expect(b.min[0]).toBeCloseTo(-(R + 1), 1);
    const cy = H / 2 - D.width / 2;
    expect(b.max[1]).toBeCloseTo(cy + R + 1, 1);
    expect(b.min[1]).toBeGreaterThanOrEqual(-H / 2); // a legenda com a data fica abaixo do céu, dentro da placa
    expect(b.min[1]).toBeLessThan(cy - R - 1);
  });

  test("diâmetro da estrela por magnitude: as brilhantes são maiores, nenhuma passa de menor que 1 mm", () => {
    expect(starDiameter(-1.46, 4.5, 1)).toBeCloseTo(1 + 5.96 * 0.55, 6);
    expect(starDiameter(4.5, 4.5, 1)).toBe(1);
    expect(starDiameter(4.5, 4.5, 0.7)).toBe(1); // o mínimo vale mesmo com a escala menor
    expect(starDiameter(2, 4.5, 1.5)).toBeCloseTo((1 + 2.5 * 0.55) * 1.5, 6);
  });

  test("outro lugar ou outra hora muda o céu; mais estrelas pesam mais", () => {
    const base = volume(part(build(), "Estrelas"));
    expect(volume(part(build({ city: "londres", utcOffset: 0 }), "Estrelas"))).not.toBeCloseTo(base, 0);
    expect(volume(part(build({ hour: 4 }), "Estrelas"))).not.toBeCloseTo(base, 0);
    expect(volume(part(build({ maxMag: 5 }), "Estrelas"))).toBeGreaterThan(base);
    expect(volume(part(build({ maxMag: 3.5 }), "Estrelas"))).toBeLessThan(base);
  });

  test("linhas das constelações: ligadas por padrão, em relevo fino; desligar tira só as linhas", () => {
    const on = volume(part(build(), "Estrelas"));
    const off = volume(part(build({ lines: false }), "Estrelas"));
    expect(D.lines).toBe(true);
    expect(on).toBeGreaterThan(off + 20); // centenas de trechos de 0,8 mm × 0,8 mm de relevo
    expect(volume(part(build(), "Placa"))).toBeCloseTo(volume(part(build({ lines: false }), "Placa")), 6);
    const b = meshBounds([part(build({ title: "" }), "Estrelas")])!;
    expect(b.max[0]).toBeCloseTo(D.width / 2 - 6 + 1, 1); // as linhas não passam do aro
    expect(meshBounds([part(build(), "Estrelas")])!.max[2]).toBeCloseTo(D.thickness + D.relief);
  });

  test("coordenadas livres valem só em \"Outra\"", () => {
    const sp = volume(part(build(), "Estrelas"));
    expect(volume(part(build({ lat: 60, lon: 10 }), "Estrelas"))).toBeCloseTo(sp, 6); // cidade escolhida vence
    expect(volume(part(build({ city: "custom", lat: 60, lon: 10 }), "Estrelas"))).not.toBeCloseTo(sp, 0);
  });

  test("apoio: suporte de mesa vira outro modelo; ímã fura a placa e avisa", () => {
    expect(build({ mount: "stand" }).models.map((m) => m.name)).toEqual(["Mapa estelar", "Suporte"]);
    const mag = build({ mount: "magnet", thickness: 4 });
    expect(mag.models).toHaveLength(1);
    expect(volume(part(build({ mount: "none", thickness: 4 }), "Placa")) - volume(part(mag, "Placa"))).toBeCloseTo(Math.PI * 5.1 ** 2 * 2, -1);
    expect(mag.warnings?.join(" ")).toMatch(/ímã de 10 mm por 2 mm/);
    expect(build({ mount: "magnet", thickness: 3 }).warnings?.join(" ")).toMatch(/use espessura de 3.2 mm ou mais/);
  });

  test("data que não existe pede correção; 29 de fevereiro vale em ano bissexto", () => {
    expect(() => build({ month: 2, day: 30 })).toThrow(MissingInput);
    expect(() => build({ month: 4, day: 31 })).toThrow(MissingInput);
    expect(() => build({ month: 2, day: 29, year: 2023 })).toThrow(MissingInput);
    expect(() => build({ month: 2, day: 29, year: 2024 })).not.toThrow();
    expect(() => build({ month: 2, day: 29, year: 1900 })).toThrow(MissingInput); // 1900 não foi bissexto
  });

  test("avisa quantas estrelas aparecem e o fuso do horário de verão", () => {
    const w = build().warnings![0];
    expect(w).toMatch(/\d+ estrelas visíveis \(até a magnitude 4.5\) no céu de São Paulo/);
    expect(w).toMatch(/horário de verão/);
  });
});
