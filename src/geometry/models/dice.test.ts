import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { modelVolume, volume } from "../testUtil";
import { buildDice, DEFAULT_DICE as D, faceArt, overhangShare, roundingRadius, type DiceParams } from "./dice";
import { DIE_KINDS, dieShape, FACE_COUNT } from "./diceFaces";
import type { ModelCtx } from "./common";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** "Fonte" de teste: cada texto vira um bloco 0,5·h × h (a conta de volume não depende de fonte). */
const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, text: (s, h) => (s.trim() ? M.CrossSection.square([h * 0.5, h], true) : null) });
const build = (p: Partial<DiceParams> = {}, c: ModelCtx = ctx()) => buildDice(c, { ...D, ...p });
const solidOf = (kind: (typeof DIE_KINDS)[number], size: number) => {
  const h = M.Manifold.hull(dieShape(kind, size).points);
  const v = h.volume();
  h.delete();
  return v;
};

describe("dados de RPG (#105)", { timeout: 60_000 }, () => {
  test.each(DIE_KINDS)("%s: apoiado na mesa, com a altura pedida e as duas cores", (kind) => {
    const { models } = build({ die: kind, rounding: 0 });
    expect(models).toHaveLength(1);
    const b = modelsBounds(models)!;
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(D.size, 1);
    expect(models[0].parts.map((p) => p.name)).toEqual(["Dado", "Gravação"]);
    expect(models[0].parts[0].color).not.toBe(models[0].parts[1].color);
  });

  test.each(DIE_KINDS)("%s: rente = o corpo e a gravação juntos fecham o sólido, sem sobrepor", (kind) => {
    const { models } = build({ die: kind, rounding: 0 });
    const [body, ink] = models[0].parts;
    expect(volume(ink.mesh)).toBeGreaterThan(0);
    expect(volume(body.mesh) + volume(ink.mesh)).toBeCloseTo(solidOf(kind, D.size), 0);
  });

  test("gravação com a profundidade pedida em cada face (conteúdo de teste: bloco 0,5·h × h)", () => {
    const { models } = build({ die: "d6", rounding: 0, size: 20, underline: false });
    // d6: raio do círculo na face = 10 mm; caixa = 13 mm; bloco 6,5 × 13 mm; 6 faces
    expect(volume(models[0].parts[1].mesh)).toBeCloseTo(6 * 6.5 * 13 * D.depth, 0);
  });

  test("arredondar tira volume das pontas (muito no d6, pouco no d20, que já é quase uma esfera) e a face de baixo continua plana na mesa", () => {
    const vol = (die: DiceParams["die"], rounding: number) => modelVolume(build({ die, rounding }).models[0]);
    expect(vol("d6", 100)).toBeLessThan(vol("d6", 0) * 0.85);
    expect(vol("d6", 50)).toBeLessThan(vol("d6", 0));
    expect(vol("d6", 50)).toBeGreaterThan(vol("d6", 100));
    expect(vol("d20", 100)).toBeLessThan(vol("d20", 0) * 0.99);
    const b = modelsBounds(build({ die: "d20", rounding: 100 }).models)!;
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(D.size, 1); // as faces seguem a distância pedida (a esfera não corta por dentro delas)
    expect(roundingRadius(dieShape("d20", 20), 0)).toBeGreaterThan(roundingRadius(dieShape("d20", 20), 100));
  });

  test("nada fica abaixo da mesa e a gravação não passa da casca do dado", () => {
    for (const style of ["flush", "engraved", "raised"] as const) {
      const { models } = build({ die: "d12", style, rounding: 40 });
      const b = meshBounds(models[0].parts.map((p) => p.mesh))!;
      expect(b.min[2]).toBeGreaterThanOrEqual(-1e-3);
    }
    const flush = build({ die: "d8", rounding: 0 }).models[0];
    const cube = solidOf("d8", D.size);
    expect(modelVolume(flush)).toBeCloseTo(cube, 0); // rente: sem material a mais nem a menos
  });

  test("gravado fundo: uma cor só e o volume do dado cai pelo que foi gravado", () => {
    const flush = build({ die: "d6", rounding: 0 }).models[0];
    const eng = build({ die: "d6", rounding: 0, style: "engraved" }).models[0];
    expect(eng.parts).toHaveLength(1);
    expect(volume(eng.parts[0].mesh)).toBeCloseTo(volume(flush.parts[0].mesh), 0);
  });

  test("em relevo: o número sobe da face (altura passa do pedido), a de baixo sai gravada e a mesa fica plana", () => {
    const { models, warnings } = build({ die: "d6", rounding: 0, style: "raised", underline: false });
    const b = modelsBounds(models)!;
    expect(b.min[2]).toBeGreaterThanOrEqual(-1e-3);
    expect(b.max[2]).toBeCloseTo(D.size + D.depth, 1);
    // 5 faces em relevo + a de baixo rebaixada: o corpo perde só o rebaixo da face de baixo
    const [body, ink] = models[0].parts;
    expect(volume(body.mesh)).toBeCloseTo(solidOf("d6", D.size) - 6.5 * 13 * D.depth, 0);
    expect(volume(ink.mesh)).toBeCloseTo(6 * 6.5 * 13 * D.depth, 0);
    expect(warnings!.join(" ")).toMatch(/face de baixo sai gravada/);
  });

  test("sublinhado só no 6 e no 9: o desenho ganha uma barra separada", () => {
    const parts = (label: string, underline: boolean) => {
      const cs = faceArt(ctx(), { ...D, underline }, label, 10)!;
      const n = cs.decompose().length;
      return n;
    };
    expect(parts("6", true)).toBe(2);
    expect(parts("9", true)).toBe(2);
    expect(parts("6", false)).toBe(1);
    expect(parts("5", true)).toBe(1);
    expect(parts("16", true)).toBe(1); // só o 6 e o 9 sozinhos
    // o dado inteiro: o d4 (1 a 4) não muda com o sublinhado
    const d4a = build({ die: "d4", rounding: 0, underline: true }).models[0];
    const d4b = build({ die: "d4", rounding: 0, underline: false }).models[0];
    expect(volume(d4a.parts[1].mesh)).toBeCloseTo(volume(d4b.parts[1].mesh), 3);
  });

  test("bolinhas no d6 (21 no total, 1 a 6); em outro dado usa números e avisa", () => {
    const { models } = build({ die: "d6", content: "pips", rounding: 0 });
    const box = 10 * 1.3;
    const pip = Math.PI * (box * 0.11) ** 2;
    expect(volume(models[0].parts[1].mesh)).toBeCloseTo(21 * pip * D.depth, -1);
    const d8 = build({ die: "d8", content: "pips" });
    expect(d8.warnings!.join(" ")).toMatch(/Bolinhas só existem no d6/);
    expect(d8.models[0].parts).toHaveLength(2);
  });

  test("texto por face: rótulos repetidos quando faltam (com aviso); sem rótulo vira prévia vazia", () => {
    const some = build({ die: "d6", content: "custom", labels: "A, B, C" });
    expect(some.warnings!.join(" ")).toMatch(/d6 tem 6 faces e você escreveu 3/);
    expect(volume(some.models[0].parts[1].mesh)).toBeGreaterThan(0);
    expect(() => build({ content: "custom", labels: " , " })).toThrow("Digite o que vai em cada face");
  });

  test("desenho enviado em todas as faces; sem desenho pede o desenho", () => {
    const art = M.CrossSection.circle(5, 24);
    const { models } = build({ die: "d12", content: "art" }, ctx(art));
    expect(volume(models[0].parts[1].mesh)).toBeGreaterThan(0);
    expect(() => build({ content: "art" })).toThrow("Envie um desenho");
  });

  test("conjunto completo: 6 dados na mesa, sem sobrepor, centrados na origem, e cabendo na mesa de 256 mm", () => {
    const { models, warnings } = build({ die: "set", rounding: 20 });
    expect(models.map((m) => m.name)).toEqual(["d4", "d6", "d8", "d10", "d12", "d20"]);
    const bs = models.map((m) => modelsBounds([m])!);
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const apart = bs[i].max[0] < bs[j].min[0] || bs[j].max[0] < bs[i].min[0] || bs[i].max[1] < bs[j].min[1] || bs[j].max[1] < bs[i].min[1];
        expect(apart, `${models[i].name} e ${models[j].name} se sobrepõem`).toBe(true);
      }
    const all = modelsBounds(models)!;
    expect((all.min[0] + all.max[0]) / 2).toBeCloseTo(0, 1);
    expect(all.max[0] - all.min[0]).toBeLessThan(256);
    expect(warnings!.join(" ")).not.toMatch(/passa da mesa/);
  });

  test("conjunto grande demais avisa que passa da mesa", () => {
    expect(build({ die: "set", size: 120 }).warnings!.join(" ")).toMatch(/passa da mesa/);
    expect(build({ die: "set", size: 40 }).warnings!.join(" ")).not.toMatch(/passa da mesa/); // dá em duas fileiras
  });

  test("face pequena demais fica sem conteúdo e avisa; peças pequenas e preenchimento aparecem sempre", () => {
    const tiny = build({ die: "d20", size: 6, rounding: 100 });
    expect(tiny.warnings!.join(" ")).toMatch(/ficaram sem conteúdo/);
    const w = build().warnings!.join(" ");
    expect(w).toMatch(/menores de 3 anos/);
    expect(w).toMatch(/100% de preenchimento/);
  });

  test("avisa de suporte quando a peça tem parte inclinada além de 45°", () => {
    expect(build({ die: "d20", rounding: 0 }).warnings!.join(" ")).toMatch(/d20: tem partes inclinadas além de 45°/);
    expect(build({ die: "d6", rounding: 0 }).warnings!.join(" ")).not.toMatch(/inclinadas/);
    const mesh = build({ die: "d20", rounding: 0 }).models[0].parts[0].mesh;
    expect(overhangShare(mesh, 0)).toBeGreaterThan(0.005);
    expect(build({ die: "d12", rounding: 0 }).warnings!.join(" ")).not.toMatch(/inclinadas/); // d12 e d8 ficam até 27° da vertical
    expect(build({ die: "d8", rounding: 0 }).warnings!.join(" ")).not.toMatch(/inclinadas/);
  });

  test("os 6 dados têm o número certo de faces gravadas (uma gravação por face)", () => {
    for (const kind of DIE_KINDS) {
      const { models } = build({ die: kind, rounding: 0 });
      const ink = volume(models[0].parts[1].mesh);
      // bloco de teste idêntico em todas as faces do mesmo dado: volume = faces · bloco · profundidade (bloco depende do raio da face)
      expect(ink / D.depth).toBeGreaterThan(FACE_COUNT[kind] * 0.9);
    }
  });
});
