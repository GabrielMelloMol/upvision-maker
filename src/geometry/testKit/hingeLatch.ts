import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { solidMesh } from "../models/common";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { COLOR_KIT } from "./color";
import { couponOf } from "./catalog";
import { tag, type K } from "./digits";

const fmt = (v: number) => v.toFixed(2).replace(".", ",");
const part = (name: string, s: Solid) => ({ name, color: COLOR_KIT, mesh: solidMesh(s) });

// ---------------------------------------------------------------- dobradiça
/** Medidas da dobradiça de pino impressa montada (raio do nó, raio do pino, largura de cada nó e folga entre eles): a caixinha termoformada usa as mesmas (#273). */
export const KIT_HINGE = { kr: 3.5, pinR: 1.5, klen: 6, axGap: 0.4 } as const;
const { kr: KR, pinR: PIN_R, klen: KLEN, axGap: AX_GAP } = KIT_HINGE;
const LEAF_T = 3, LEAF_Y = 14, NECK = 4.2;
const KNUCKLES = { a1: 0, b: KLEN + AX_GAP, a2: 2 * (KLEN + AX_GAP) };
const LEN = KNUCKLES.a2 + KLEN;

/**
 * Dobradiça de pino impressa montada (organizadora, #204): duas folhas, três nós (A–B–A), pino de 3 mm preso nos nós A e furo do nó B
 * com `clearance` de folga radial; entre os nós há 0,4 mm de folga axial. Cada folha sai deitada na mesa.
 */
export function hinges(M: ManifoldToplevel): Model[] {
  const c = couponOf("hinge");
  return c.sweep.map((cl, i) =>
    scoped((k) => {
      const zc = KR;
      const along = (len: number, r: number, x0: number) => k(k(k(M.Manifold.cylinder(len, r, r, 56)).rotate([0, 90, 0])).translate([x0, 0, zc]));
      const box = (x0: number, x1: number, y0: number, y1: number) => k(k(M.Manifold.cube([x1 - x0, y1 - y0, LEAF_T])).translate([x0, y0, 0]));
      const aNeck = (x0: number) => box(x0, x0 + KLEN, -NECK, 0);
      const label = k(tag(M, k, i + 1).translate([LEN / 2, -(NECK + LEAF_Y) / 2 - 2, LEAF_T - 0.01]));
      const a = k(M.Manifold.union([along(KLEN, KR, KNUCKLES.a1), along(KLEN, KR, KNUCKLES.a2), along(LEN, PIN_R, 0), aNeck(KNUCKLES.a1), aNeck(KNUCKLES.a2), box(0, LEN, -NECK - LEAF_Y, -NECK), label]));
      const bRaw = k(M.Manifold.union([along(KLEN, KR, KNUCKLES.b), box(KNUCKLES.b, KNUCKLES.b + KLEN, 0, NECK), box(0, LEN, NECK, NECK + LEAF_Y)]));
      const b = k(bRaw.subtract(along(LEN + 2, PIN_R + cl, -1)));
      return { name: `Dobradiça ${i + 1} (folga ${fmt(cl)})`, parts: [part("Folha A (com o pino)", a), part("Folha B", b)] };
    }),
  );
}

// ---------------------------------------------------------------- trava
const A_BASE = 22, WIDTH = 16, STRIP = 1.4, GAP = 0.8, STRIP_H = 24, BASE_T = 3, WALL_T = 5, LTOP = 30;
const poly = (M: ManifoldToplevel, k: K, pts: [number, number][]): CS => k(new M.CrossSection([pts], "NonZero"));
/** Perfil em (x, z) extrudado ao longo de y e centrado em y = 0. */
const along_y = (k: K, cs: CS): Solid => k(k(k(cs.extrude(WIDTH)).rotate([90, 0, 0])).translate([0, WIDTH / 2, 0]));

/**
 * Trava de encaixe (organizadora, #204): a peça A tem uma lâmina de 1,4 mm com um gancho de `reach` mm de profundidade; a B, um batente com
 * rampa e um rebaixo. A pessoa vira a A de cabeça para baixo e empurra sobre a B: o gancho desliza pela rampa e estala no rebaixo.
 */
export function latches(M: ManifoldToplevel): Model[] {
  const c = couponOf("latch");
  return c.sweep.map((r, i) =>
    scoped((k) => {
      const rect = (x0: number, z0: number, x1: number, z1: number) => poly(M, k, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
      const aProfile = k(M.CrossSection.union([rect(0, 0, A_BASE, BASE_T), rect(0, BASE_T - 0.01, STRIP, BASE_T + STRIP_H), poly(M, k, [[STRIP - 0.01, BASE_T + STRIP_H], [STRIP + r, BASE_T + STRIP_H - 1.6], [STRIP + r, BASE_T + STRIP_H - 3], [STRIP - 0.01, BASE_T + STRIP_H - 3]])]));
      // a etiqueta fica no trecho da base que, com a A virada, passa além do batente (não bate nele)
      const labelA = k(tag(M, k, i + 1).translate([A_BASE - 5.5, 0, BASE_T - 0.01]));
      const a = k(M.Manifold.union([along_y(k, aProfile), labelA]));
      // B no quadro montado: a face do batente fica a GAP da lâmina, do lado do gancho (x negativo)
      const face = -(STRIP + GAP);
      const notch = rect(face - (r + 0.2), LTOP - 24.2, face + 0.01, LTOP - 20.8);
      const leadIn = poly(M, k, [[face + 0.01, LTOP + 0.01], [face + 0.01, LTOP - 1.5], [face - 1.5, LTOP + 0.01]]);
      const wall = k(k(M.CrossSection.union([rect(face - 20, 0, face, BASE_T), rect(face - WALL_T, BASE_T - 0.01, face, LTOP)])).subtract(k(M.CrossSection.union([notch, leadIn]))));
      const labelB = k(tag(M, k, i + 1).translate([face - 14, 0, BASE_T - 0.01]));
      const b = k(M.Manifold.union([along_y(k, wall), labelB]));
      const shift = k(b.translate([-(face - 20) + 8 + 12, 0, 0]));
      return { name: `Trava ${i + 1} (gancho ${fmt(r)})`, parts: [part("Peça A (lâmina com gancho)", a), part("Peça B (batente)", shift)] };
    }),
  );
}
