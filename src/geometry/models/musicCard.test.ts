import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { MissingInput } from "./common";
import { buildMusicCard, DEFAULT_MUSIC_CARD as D, type MusicCardParams } from "./musicCard";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** "Fonte" de teste: o texto vira um bloco 0,5·h × h por letra. */
const ctx = (art: ModelCtx["art"] = null, layers: ModelCtx["artLayers"] = null): ModelCtx => ({ M, art, artLayers: layers, text: (s, h) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null) });
const build = (p: Partial<MusicCardParams> = {}, c: ModelCtx = ctx()) => buildMusicCard(c, { ...D, ...p });
const part = (out: ReturnType<typeof build>, name: string) => out.models[0].parts.find((x) => x.name === name)?.mesh;
const width = (m: NonNullable<ReturnType<typeof part>>) => { const b = meshBounds([m])!; return [b.max[0] - b.min[0], b.max[1] - b.min[1]]; };

describe("cartão de música (#112)", { timeout: 60_000 }, () => {
  test("placa na largura pedida, na mesa; textos e destaque em relevo sobre ela", () => {
    const out = build({ mount: "none" });
    const plate = meshBounds([part(out, "Placa")!])!;
    expect(plate.max[0] - plate.min[0]).toBeCloseTo(D.width, 1);
    expect(plate.min[2]).toBeCloseTo(0);
    expect(plate.max[2]).toBeCloseTo(D.thickness);
    for (const name of ["Texto", "Destaque"]) {
      const b = meshBounds([part(out, name)!])!;
      expect(b.min[2]).toBeCloseTo(D.thickness);
      expect(b.max[2]).toBeCloseTo(D.thickness + D.relief);
    }
    const all = modelsBounds(out.models)!;
    expect(all.max[2]).toBeCloseTo(D.thickness + D.relief);
  });

  test("tudo cabe dentro da placa", () => {
    const out = build({ line3: "uma terceira linha", line4: "e a quarta", mount: "none" });
    const plate = meshBounds([part(out, "Placa")!])!;
    for (const name of ["Texto", "Destaque"]) {
      const b = meshBounds([part(out, name)!])!;
      expect(b.min[0]).toBeGreaterThanOrEqual(plate.min[0] + 1);
      expect(b.max[0]).toBeLessThanOrEqual(plate.max[0] - 1);
      expect(b.min[1]).toBeGreaterThanOrEqual(plate.min[1] + 1);
      expect(b.max[1]).toBeLessThanOrEqual(plate.max[1] - 1);
    }
  });

  test("mais linhas de letra deixam a placa mais alta; sem botões fica mais baixa", () => {
    const h = (p: Partial<MusicCardParams>) => width(part(build({ mount: "none", ...p }), "Placa")!)[1];
    expect(h({ line3: "x", line4: "y" })).toBeGreaterThan(h({}) + 5);
    expect(h({ showButtons: false })).toBeLessThan(h({}) - 5);
  });

  test("o progresso move o fim do trecho tocado", () => {
    const right = (progress: number) => meshBounds([part(build({ progress, showButtons: false, mount: "none" }), "Destaque")!])!.max[0];
    expect(right(80)).toBeGreaterThan(right(20) + 0.5 * D.width * (1 - 0.14) * 0.5);
  });

  test("foto enviada ocupa um quadrado da largura útil; colorida vira uma parte por cor", () => {
    const art = M.CrossSection.square([30, 30], true);
    const layers = [{ color: "#ff0000", cs: M.CrossSection.square([30, 15], false).translate([-15, -15]) }, { color: "#0000ff", cs: M.CrossSection.square([30, 15], false).translate([-15, 0]) }];
    const out = build({ mount: "none" }, ctx(art, layers));
    const fotos = out.models[0].parts.filter((x) => x.name.startsWith("Foto"));
    expect(fotos).toHaveLength(2);
    const b = meshBounds(fotos.map((f) => f.mesh))!;
    const side = D.width * (1 - 2 * 0.07);
    expect(b.max[0] - b.min[0]).toBeCloseTo(side, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(side, 1);
    expect(new Set(fotos.map((f) => f.color)).size).toBe(2);
    const without = build({ mount: "none" });
    expect(width(part(out, "Placa")!)[1]).toBeGreaterThan(width(part(without, "Placa")!)[1] + side - 1);
  });

  test("suporte acrescenta o modelo do suporte; ímã tira o volume do bolso e avisa a espessura mínima", () => {
    expect(build({ mount: "stand" }).models).toHaveLength(2);
    expect(build({ mount: "none" }).models).toHaveLength(1);
    const plain = volume(part(build({ mount: "none", thickness: 4 }), "Placa")!);
    const magnet = build({ mount: "magnet", thickness: 4 });
    const pocket = Math.PI * 5.1 * 5.1 * 2;
    expect(plain - volume(part(magnet, "Placa")!)).toBeCloseTo(pocket, -1);
    expect(magnet.warnings!.join(" ")).toMatch(/ímã de 10 mm/);
    expect(build({ mount: "magnet", thickness: 3 }).warnings!.join(" ")).toMatch(/espessura de 3.2 mm ou mais/);
  });

  test("sem título, artista nem foto: pede dados; elementos movíveis listados", () => {
    expect(() => build({ title: "", artist: "" })).toThrow(MissingInput);
    const ids = build().elements!.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["title", "artist", "lyric1", "bar", "progress", "timeStart", "timeEnd", "buttons"]));
  });
});
