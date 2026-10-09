import { beforeAll, describe, expect, test } from "vitest";
import { bedMm } from "../bed";
import { modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel, type Solid } from "../manifold";
import type { ModelCtx } from "./common";
import { buildPhoneStandFold, DEFAULT_PHONE_STAND_FOLD as D, FOLD_BARREL, FOLD_PLATE, foldDims, foldPieces, foldPose, type PhoneStandFoldParams } from "./phoneStandFold";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null) });
const params = (p: Partial<PhoneStandFoldParams> = {}): PhoneStandFoldParams => ({ ...D, ...p });
const SEARCH = 3; // procura as peças mais próximas até 3 mm

type Pieces = ReturnType<typeof foldPieces>;
function withPieces<T>(p: PhoneStandFoldParams, fn: (pieces: Pieces) => T): T {
  const pieces = foldPieces(M, p);
  try {
    return fn(pieces);
  } finally {
    [pieces.base, pieces.cradle, pieces.strut].forEach((s) => s.delete());
  }
}
const overlap = (a: Solid, b: Solid) => {
  const i = a.intersect(b);
  const v = i.volume();
  i.delete();
  return v;
};
/** Folga mínima entre duas peças, em mm (0 se encostam ou se cruzam). */
const gap = (a: Solid, b: Solid) => (overlap(a, b) > 1e-6 ? 0 : a.minGap(b, SEARCH));
const posed = <T>(pieces: Pieces, p: PhoneStandFoldParams, layout: "print" | "assembled" | "folded", angle: number | undefined, fn: (s: Pieces) => T): T => {
  const s = foldPose(pieces, p, layout, angle);
  try {
    return fn(s);
  } finally {
    [s.base, s.cradle, s.strut].forEach((o) => o.delete());
  }
};

describe("suporte de celular dobrável: as peças da dobradiça não se tocam", () => {
  for (const clearance of [0.3, 0.4, 0.5]) {
    test(`folga de ${clearance} mm: três peças separadas, sem volume em comum e com a folga pedida entre as que se encaixam`, () => {
      const p = params({ clearance });
      withPieces(p, ({ base, cradle, strut }) => {
        // três sólidos soltos, inteiros
        for (const s of [base, cradle, strut]) {
          const parts = s.decompose();
          expect(parts).toHaveLength(1);
          parts.forEach((x) => x.delete());
        }
        expect(overlap(base, cradle)).toBe(0);
        expect(overlap(cradle, strut)).toBe(0);
        expect(overlap(base, strut)).toBe(0);
        // pinos e tubos: a face de 24 lados deixa a folga real em cos(7,5°) do valor pedido
        const facet = Math.cos((7.5 * Math.PI) / 180);
        const baseCradle = base.minGap(cradle, SEARCH);
        const cradleStrut = cradle.minGap(strut, SEARCH);
        expect(baseCradle).toBeGreaterThanOrEqual(clearance * facet - 1e-3);
        expect(cradleStrut).toBeGreaterThanOrEqual(clearance * facet - 1e-3);
        // e não é folga demais: a dobradiça não balança além de 1,5 vez a pedida
        expect(baseCradle).toBeLessThanOrEqual(clearance * 1.5);
        expect(cradleStrut).toBeLessThanOrEqual(clearance * 1.5);
        // a base e a escora ficam longe uma da outra na impressão
        expect(base.minGap(strut, 50)).toBeGreaterThan(clearance);
      });
    });
  }

  test("a folga cresce junto com o parâmetro (0,3 → 0,5 mm)", () => {
    const small = withPieces(params({ clearance: 0.3 }), ({ base, cradle }) => base.minGap(cradle, SEARCH));
    const large = withPieces(params({ clearance: 0.5 }), ({ base, cradle }) => base.minGap(cradle, SEARCH));
    expect(large - small).toBeGreaterThan(0.15);
  });

  test("girando o apoio de 0 a 180° em volta da dobradiça de baixo, nunca encosta na base", () => {
    const p = params();
    withPieces(p, (pieces) => {
      for (let a = 0; a <= 180; a += 15) {
        posed(pieces, p, "assembled", a, ({ base, cradle }) => {
          // "assembled" também gira a escora; aqui só interessa o apoio, que gira o ângulo inteiro
          expect(overlap(base, cradle), `apoio a ${a}° cruza a base`).toBe(0);
          expect(gap(base, cradle), `apoio a ${a}° encosta na base`).toBeGreaterThan(0.25);
        });
      }
    });
  });

  test("girando a escora de 0 até o dobro da trava mais aberta em volta da dobradiça de cima, nunca encosta no apoio", () => {
    const p = params();
    const d = foldDims(p);
    withPieces(p, ({ cradle, strut }) => {
      for (let a = 0; a <= 2 * Math.max(...d.locks); a += 10) {
        const turned = scopedSwing(strut, d.lb, -a);
        try {
          expect(overlap(cradle, turned), `escora a ${a}° cruza o apoio`).toBe(0);
          expect(gap(cradle, turned), `escora a ${a}° encosta no apoio`).toBeGreaterThan(0.25);
        } finally {
          turned.delete();
        }
      }
    });
  });
});

/** Gira a escora em torno do eixo de cima (y = lb, altura do tubo), como no suporte. */
function scopedSwing(s: Solid, axisY: number, deg: number): Solid {
  const a = s.translate([0, -axisY, -FOLD_BARREL]);
  const b = a.rotate([deg, 0, 0]);
  const c = b.translate([0, axisY, FOLD_BARREL]);
  a.delete();
  b.delete();
  return c;
}

describe("suporte de celular dobrável: travas de ângulo", () => {
  const p = params();
  const d = foldDims(p);

  test("há 3 travas (fendas) ao redor do ângulo escolhido", () => {
    expect(d.locks).toEqual([45, 55, 65]);
    expect(d.slotY).toHaveLength(3);
    // ângulo mais aberto = escora mais perto da dobradiça
    expect(d.slotY[0]).toBeGreaterThan(d.slotY[1]);
    expect(d.slotY[1]).toBeGreaterThan(d.slotY[2]);
  });

  test("em cada trava a escora monta sem cruzar a base e a ponta entra na fenda (abaixo do topo do trilho)", () => {
    withPieces(p, (pieces) => {
      for (const deg of d.locks) {
        posed(pieces, p, "assembled", deg, ({ base, cradle, strut }) => {
          expect(overlap(base, strut), `escora a ${deg}° bate na base`).toBe(0);
          expect(overlap(base, cradle), `apoio a ${deg}° bate na base`).toBe(0);
          expect(overlap(cradle, strut), `escora a ${deg}° bate no apoio`).toBe(0);
          const tipLow = strut.boundingBox().min[2];
          expect(tipLow, `a ponta da escora a ${deg}° não chega à fenda`).toBeLessThan(7.5 - 0.8);
          expect(tipLow, `a ponta da escora a ${deg}° passa do fundo da fenda`).toBeGreaterThan(7.5 - 4.5);
          // e a folga na fenda existe: a ponta não encosta nas paredes
          expect(gap(base, strut), `a ponta a ${deg}° encosta na fenda`).toBeGreaterThan(0.2);
        });
      }
    });
  });

  test("o apoio fica inclinado exatamente no ângulo da trava", () => {
    withPieces(p, (pieces) => {
      for (const deg of d.locks) {
        posed(pieces, p, "assembled", deg, ({ cradle }) => {
          const b = cradle.boundingBox();
          // a ponta de cima do apoio sobe e recua: altura ≈ eixo + comprimento · sen(ângulo)
          const expectedTop = FOLD_BARREL + d.lb * Math.sin((deg * Math.PI) / 180);
          expect(b.max[2]).toBeGreaterThan(expectedTop - 1);
          expect(b.max[2]).toBeLessThan(expectedTop + FOLD_BARREL + 1);
        });
      }
    });
  });

  test("dobrado: o apoio vira sobre a base sem encostar nela", () => {
    withPieces(p, (pieces) => {
      posed(pieces, p, "folded", undefined, ({ base, cradle, strut }) => {
        expect(overlap(base, cradle)).toBe(0);
        expect(overlap(base, strut)).toBe(0);
        expect(gap(base, cradle)).toBeGreaterThan(0.25); // só a folga da dobradiça; as placas ficam a 2 mm uma da outra
        expect(cradle.boundingBox().max[2]).toBeCloseTo(2 * FOLD_BARREL, 1); // a placa virada fica por cima, no alto do tubo
      });
    });
  });

  test("o apoio a 45, 55 e 65° (ângulo na trava do meio) também monta", () => {
    for (const angle of [45, 65]) {
      const q = params({ angle });
      const dq = foldDims(q);
      withPieces(q, (pieces) => {
        for (const deg of dq.locks) {
          posed(pieces, q, "assembled", deg, ({ base, strut }) => {
            expect(overlap(base, strut), `ângulo ${angle}, trava ${deg}°`).toBe(0);
            expect(strut.boundingBox().min[2], `ângulo ${angle}, trava ${deg}°`).toBeLessThan(7.5);
          });
        }
      });
    }
  });
});

describe("suporte de celular dobrável: saída do modelo", () => {
  test("um modelo com Base, Apoio e Escora, aberto e deitado, dentro da mesa e com 4,5 mm de espessura de placa", () => {
    const out = buildPhoneStandFold(ctx(), params());
    expect(out.models).toHaveLength(1);
    expect(out.models[0].parts.map((x) => x.name)).toEqual(["Base", "Apoio", "Escora"]);
    const b = modelsBounds(out.models)!;
    const [w, l] = [b.max[0] - b.min[0], b.max[1] - b.min[1]];
    expect(w).toBeCloseTo(70, 1);
    expect(l).toBeLessThanOrEqual(bedMm());
    expect(b.min[2]).toBeCloseTo(0, 2); // tudo na mesa
    expect(b.max[2]).toBeCloseTo(2 * FOLD_BARREL, 1); // o tubo da dobradiça é a parte mais alta
    expect(out.warnings!.join(" ")).toMatch(/dobre e abra cada dobradiça/);
  });

  test("a frente do modelo é −Y: a base com o nome fica do lado de −Y", () => {
    const out = buildPhoneStandFold(ctx(), params({ text: "Ana" }));
    const base = modelsBounds([{ name: "b", parts: [out.models[0].parts[0]] }])!;
    const apoio = modelsBounds([{ name: "a", parts: [out.models[0].parts[1]] }])!;
    expect(base.min[1]).toBeLessThan(apoio.min[1]);
    expect(out.models[0].parts.map((x) => x.name)).toContain("Texto");
  });

  test("nome em relevo na base: por cima da placa, no tamanho pedido", () => {
    const out = buildPhoneStandFold(ctx(), params({ text: "Ana", textHeight: 8, relief: 0.8 }));
    const text = out.models[0].parts.find((x) => x.name === "Texto")!;
    const b = modelsBounds([{ name: "t", parts: [text] }])!;
    expect(b.min[2]).toBeCloseTo(FOLD_PLATE, 2);
    expect(b.max[2]).toBeCloseTo(FOLD_PLATE + 0.8, 2);
    expect(b.max[1]).toBeLessThan(0); // na base da frente
  });

  test("a prévia montada e a dobrada avisam que não são para imprimir", () => {
    expect(buildPhoneStandFold(ctx(), params({ layout: "assembled" })).warnings!.join(" ")).toMatch(/só a prévia do suporte montado/);
    expect(buildPhoneStandFold(ctx(), params({ layout: "folded" })).warnings!.join(" ")).toMatch(/só a prévia do suporte dobrado/);
  });

  test("avisa de folga fora de 0,3 a 0,5 mm e de peça que não cabe na mesa", () => {
    expect(buildPhoneStandFold(ctx(), params({ clearance: 0.2 })).warnings!.join(" ")).toMatch(/Folga fora de 0,3 a 0,5/);
    expect(buildPhoneStandFold(ctx(), params({ height: 150, frontLength: 90 })).warnings!.join(" ")).toMatch(/não cabe na mesa/);
  });

  test("a ponta da escora fica longe dos trilhos na impressão (não grudam)", () => {
    const d = foldDims(params());
    expect(d.barStart).toBeGreaterThan(d.railEnd + 2);
  });

  test("não apaga o desenho enviado", () => {
    const art = M.CrossSection.square([20, 10], true);
    const out = buildPhoneStandFold({ ...ctx(), art }, params());
    expect(out.models[0].parts.map((x) => x.name)).toContain("Texto");
    expect(art.isEmpty()).toBe(false); // ainda vivo: a conta do tamanho segue funcionando
    art.delete();
  });
});
