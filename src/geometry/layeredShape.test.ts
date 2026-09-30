import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { buildLayeredPicture, DEFAULT_LAYERED, type LayeredParams } from "./layeredPicture";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { volume } from "./testUtil";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// 81×61 pontos de 0,5 mm = 40 × 30 mm; degradê do preto (esquerda) ao branco (direita)
const COLS = 81, ROWS = 61, CELL = 0.5;
const ramp = Float32Array.from({ length: COLS * ROWS }, (_, i) => (i % COLS) / (COLS - 1));
// sujeito: disco de raio 10 mm no centro
const disc = Uint8Array.from({ length: COLS * ROWS }, (_, i) => {
  const x = (i % COLS) * CELL - 20, y = Math.floor(i / COLS) * CELL - 15;
  return x * x + y * y <= 100 ? 1 : 0;
});
const build = (p: Partial<LayeredParams>) => buildLayeredPicture(M, ramp, COLS, ROWS, CELL, { ...DEFAULT_LAYERED, ...p });
const bounds = (p: Partial<LayeredParams>) => meshBounds(build(p).model.parts.map((x) => x.mesh))!;
const vol = (p: Partial<LayeredParams>) => build(p).model.parts.reduce((s, x) => s + volume(x.mesh), 0);

describe("quadro por camadas: formatos, pingente, ímã, sujeito e TD (#100)", { timeout: 60_000 }, () => {
  test("círculo e coração cabem na imagem e tiram material; retângulo continua igual", () => {
    const rect = vol({});
    const circle = bounds({ shape: "circle" });
    expect(circle.max[0] - circle.min[0]).toBeCloseTo(30, 0);
    expect(circle.max[1] - circle.min[1]).toBeCloseTo(30, 0);
    expect(vol({ shape: "circle" })).toBeLessThan(rect);
    expect(vol({ shape: "rounded" })).toBeLessThan(rect);
    const heart = bounds({ shape: "heart" });
    expect(heart.max[1] - heart.min[1]).toBeLessThanOrEqual(30.01);
    expect(heart.max[0] - heart.min[0]).toBeLessThanOrEqual(40.01);
  });

  test("contorno do sujeito: recorta no disco", () => {
    const b = bounds({ shape: "subject", mask: disc });
    expect(b.max[0] - b.min[0]).toBeCloseTo(20, 0);
    expect(b.max[1] - b.min[1]).toBeCloseTo(20, 0);
    expect(() => build({ shape: "subject" })).toThrow(/sujeito/);
  });

  test("pingente e marca-página: aba com furo acima do topo, na altura da base", () => {
    const plain = bounds({});
    for (const hang of ["pendant", "bookmark"] as const) {
      const b = bounds({ hang });
      expect(b.max[1]).toBeGreaterThan(plain.max[1] + 3);
    }
    // furo maior tira mais
    expect(vol({ hang: "bookmark" })).toBeLessThan(vol({ hang: "pendant" }) + 20);
  });

  test("encaixe de ímã: base mais grossa, oco fechado por dentro e pausa logo acima dele", () => {
    const lh = DEFAULT_LAYERED.layerHeight;
    const out = build({ magnet: true, magnetD: 10, magnetH: 2 });
    expect(out.magnetZ).toBeDefined();
    const z = out.magnetZ!;
    expect(z / lh).toBeCloseTo(Math.round(z / lh), 6);
    expect(z).toBeGreaterThan(2);
    // o topo subiu o tanto que o ímã pede
    expect(meshBounds([out.model.parts[0].mesh])!.max[2]).toBeGreaterThan(bounds({}).max[2] + 2);
    // oco interno: volume menor que o do sólido cheio da mesma altura
    const noHole = vol({ magnet: true, magnetD: 10, magnetH: 2, magnetHole: false });
    const hole = Math.PI * (10.3 / 2) ** 2 * 2.2;
    expect((noHole - vol({ magnet: true, magnetD: 10, magnetH: 2 })) / hole).toBeGreaterThan(0.9);
    // as trocas de cor vêm depois do ímã
    expect(out.swaps[0].z).toBeGreaterThan(z);
  });

  test("fundo liso numa cor: fora do sujeito a altura fica no topo da faixa dessa cor", () => {
    const out = build({ mask: disc, background: 0, split: true });
    // canto (fundo) na cor mais escura: a parte da 2ª cor não chega no canto
    const second = meshBounds([out.model.parts[1].mesh])!;
    expect(second.min[0]).toBeGreaterThan(-20 + 4);
    // fundo na cor mais clara: tudo fora do disco sobe até o topo
    expect(vol({ mask: disc, background: 2 })).toBeGreaterThan(vol({ mask: disc, background: 0 }));
  });

  test("TD: filamento mais transparente ganha faixa mais alta", () => {
    const even = build({});
    const td = build({ tds: [1, 1, 4] }); // o mais claro (em cima) é o mais transparente
    const gap = (s: { z: number }[]) => s[1].z - s[0].z;
    expect(gap(td.swaps)).toBeLessThan(gap(even.swaps));
    // sem TD em nenhum: igual ao de antes
    expect(build({ tds: [null, null, null] }).swaps).toEqual(even.swaps);
  });
});
