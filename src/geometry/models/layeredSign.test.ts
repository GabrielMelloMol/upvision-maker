import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { sq, volume } from "../testUtil";
import type { Model } from "../types";
import type { ModelCtx } from "./common";
import { VARIANTS } from "../../tools/models/variants";
import { buildLayeredSign, DEFAULT_LAYERED_SIGN as D, type LayeredSignParams } from "./layeredSign";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// "fonte" de teste: cada texto vira um retângulo 0,6·h por letra × h, com um furo no meio (como um "O")
const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({
  M,
  art,
  text: (s, h) => {
    const w = 0.6 * h * s.trim().length;
    return s.trim() ? new M.CrossSection([[[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], sq(h / 4)], "EvenOdd") : null;
  },
});
const build = (p: Partial<LayeredSignParams> = {}, art: ModelCtx["art"] = null) => buildLayeredSign(ctx(art), { ...D, mount: "none", ...p });
const part = (m: Model, name: string) => m.parts.find((q) => q.name === name);
const top = (m: Model, name: string) => meshBounds([part(m, name)!.mesh])!.max[2];

describe("letreiro em camadas (#48)", { timeout: 30_000 }, () => {
  test("2 linhas sobrepostas: a de baixo sobe mais e a de cima perde a parte coberta; base contorna tudo", () => {
    const [m] = build().models;
    expect(m.parts.map((q) => q.name)).toEqual(["Base", "Linha 1", "Linha 2"]);
    expect(top(m, "Linha 1")).toBeCloseTo(D.baseThickness + D.relief);
    expect(top(m, "Linha 2")).toBeCloseTo(D.baseThickness + D.relief + D.layerStep);
    // sem sobreposição a linha 1 fica inteira: com sobreposição ela perde volume
    const full = volume(part(build({ overlap: 0 }).models[0], "Linha 1")!.mesh);
    expect(volume(part(m, "Linha 1")!.mesh)).toBeLessThan(full - 1);
    const b = modelsBounds([m])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(0.6 * D.h2 * 11 + 2 * D.border, 0);
  });

  test("até 4 linhas, uma cor por linha; linhas vazias são puladas", () => {
    const [m] = build({ line3: "de", line4: "Ana" }).models;
    expect(m.parts.map((q) => q.color)).toEqual([D.baseColor, D.c1, D.c2, D.c3, D.c4]);
    expect(build({ line1: "", line2: "Só" }).models[0].parts.map((q) => q.name)).toEqual(["Base", "Linha 1"]);
  });

  test("preencher furos das letras aumenta o volume da linha", () => {
    const vol = (fill: boolean) => volume(part(build({ fillHoles: fill, line2: "" }).models[0], "Linha 1")!.mesh);
    expect(vol(true)).toBeGreaterThan(vol(false) + 10);
  });

  test("imagem à esquerda, enfeite à direita, ambos dentro da base", () => {
    const [m] = build({ ornament: "heart" }, new M.CrossSection([sq(10)], "NonZero")).models;
    expect(m.parts.map((q) => q.name)).toEqual(["Base", "Linha 1", "Linha 2", "Imagem", "Enfeite"]);
    const img = meshBounds([part(m, "Imagem")!.mesh])!, orn = meshBounds([part(m, "Enfeite")!.mesh])!, txt = meshBounds([part(m, "Linha 2")!.mesh])!;
    expect(img.max[0]).toBeLessThan(txt.min[0]);
    expect(orn.min[0]).toBeGreaterThan(txt.max[0] - 1);
    expect(img.max[1] - img.min[1]).toBeCloseTo(D.artHeight, 0);
  });

  test("pendurar fura a base; suporte vira peça à parte; aviso de mesa", () => {
    const flat = volume(build({ border: 8 }).models[0].parts[0].mesh);
    const hung = build({ mount: "hang", border: 8 });
    expect(hung.warnings).toEqual([]);
    expect(volume(hung.models[0].parts[0].mesh)).toBeCloseTo(flat - 2 * Math.PI * 4 * D.baseThickness, -1);
    expect(build({ mount: "stand" }).models.map((m) => m.name)).toEqual(["Letreiro", "Suporte"]);
    expect(build({ h2: 60 }).warnings!.join(" ")).toMatch(/passa da mesa/);
  });

  test("sem texto: prévia vazia", () => {
    expect(() => build({ line1: "", line2: "" })).toThrow("Digite pelo menos uma linha");
  });

  test("QR ao lado do texto, com a base cobrindo o quadrado do QR", () => {
    const [m] = build({ qr: "https://exemplo.com" }).models;
    const qr = meshBounds([part(m, "QR")!.mesh])!, txt = meshBounds([part(m, "Linha 2")!.mesh])!, base = meshBounds([m.parts[0].mesh])!;
    expect(qr.min[0]).toBeGreaterThan(txt.max[0]);
    expect(qr.max[0] - qr.min[0]).toBeCloseTo(D.qrSize, 0);
    expect(base.max[0]).toBeGreaterThan(qr.max[0] + D.border - 0.5);
    expect(qr.min[2]).toBeCloseTo(D.baseThickness);
  });

  test("textura rebaixada no fundo visível da base (#50)", () => {
    const vol = (t: LayeredSignParams["texture"]) => volume(build({ texture: t, border: 10 }).models[0].parts[0].mesh);
    expect(vol("stripes")).toBeLessThan(vol("none") - 20);
    // o texto não fica sobre buraco: a parte embaixo das linhas continua cheia
    const [m] = build({ texture: "checker", border: 10 }).models;
    expect(meshBounds([m.parts[0].mesh])!.max[2]).toBeCloseTo(D.baseThickness);
  });
  test("moldura separada: anel em volta da base com folga, peça à parte na própria cor", () => {
    const without = build();
    expect(without.models).toHaveLength(1);
    const out = build({ frame: true, frameWidth: 3, frameColor: "#c9a227" });
    expect(out.models.map((m) => m.name)).toEqual(["Letreiro", "Moldura"]);
    const frame = out.models[1];
    expect(frame.parts[0].color).toBe("#c9a227");
    const base = meshBounds([part(out.models[0], "Base")!.mesh])!;
    const f = meshBounds([frame.parts[0].mesh])!;
    // o anel passa da base por frameWidth de cada lado, menos a folga, e sobe um pouco mais que a base
    expect(f.max[0] - f.min[0]).toBeCloseTo(base.max[0] - base.min[0] + 2 * 3, 0);
    expect(f.max[2]).toBeGreaterThan(base.max[2]);
    // o miolo está vazio: o volume é bem menor que o de uma placa cheia
    expect(volume(frame.parts[0].mesh)).toBeLessThan(((f.max[0] - f.min[0]) * (f.max[1] - f.min[1]) * (f.max[2] - f.min[2])) * 0.6);
  });

  test("a moldura não toca a base: a base cabe inteira no vão do anel", () => {
    const out = build({ frame: true, frameWidth: 3 });
    const solid = (mm: { positions: Float32Array; indices: Uint32Array }) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: mm.positions, triVerts: mm.indices }));
    const a = solid(out.models[0].parts[0].mesh), b = solid(out.models[1].parts[0].mesh);
    expect(a.intersect(b).volume()).toBeLessThan(1e-3);
  });

  test("ornamento pata para pet", () => {
    const out = build({ ornament: "paw", ornamentSize: 16 });
    expect(out.models[0].parts.some((q) => q.name === "Enfeite")).toBe(true);
  });
  test("layouts prontos de data (#117): nascimento, casamento, casa nova e pet geram letreiro e moldura, cabem na mesa", () => {
    const labels = VARIANTS.layeredSign.map((v) => v.label);
    expect(labels).toEqual(["Nascimento", "Casamento", "Casa nova", "Pet (in memoriam)"]);
    for (const v of VARIANTS.layeredSign) {
      const out = buildLayeredSign(ctx(), { ...D, ...(v.patch as Partial<LayeredSignParams>) });
      expect(out.warnings ?? [], v.label).toEqual([]);
      expect(out.models.map((m) => m.name), v.label).toContain("Moldura");
      const lines = out.models[0].parts.filter((q) => q.name.startsWith("Linha")).length;
      const wanted = [v.patch.line1, v.patch.line2, v.patch.line3, v.patch.line4].filter((t) => String(t ?? "").trim()).length;
      expect(lines, v.label).toBe(wanted);
    }
  });
});
