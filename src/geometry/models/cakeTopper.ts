import { fitInto, scoped } from "../shape2d";
import { backing, size2, slab, type ModelCtx, type ModelOutput } from "./common";

export type CakeTopperParams = {
  line1: string;
  line2: string;
  width: number;
  thickness: number;
  relief: number;
  border: number;
  stakes: number; // 1 ou 2
  stakeLength: number;
  baseColor: string;
  textColor: string;
};

export const DEFAULT_CAKE_TOPPER: CakeTopperParams = {
  line1: "Ana",
  line2: "15 anos",
  width: 140,
  thickness: 3,
  relief: 1,
  border: 3,
  stakes: 2,
  stakeLength: 60,
  baseColor: "#f5c542",
  textColor: "#ffffff",
};

const STAKE_W = 6;
const BAR_H = 6;
const TIP = 8;
const LINE2_RATIO = 0.45;

/** Topo de bolo: texto (1 ou 2 linhas) sobre fundo contornado, com palitos para espetar. Impresso deitado. */
export function buildCakeTopper({ M, text }: ModelCtx, p: CakeTopperParams): ModelOutput {
  return scoped((k) => {
    const raw1 = text(p.line1, 100);
    if (!raw1) throw new Error("Digite o texto do topo.");
    const l1 = k(fitInto(k(raw1), p.width, 1e6, 0));
    const h1 = size2(l1)[1];
    const raw2 = text(p.line2, h1 * LINE2_RATIO);
    const l2 = raw2 ? k(fitInto(k(raw2), p.width * 0.8, h1 * LINE2_RATIO, -(h1 / 2 + p.border + (h1 * LINE2_RATIO) / 2))) : null;
    const letters = k(l2 ? l1.add(l2) : l1.translate([0, 0]));
    const base = k(backing(M, letters, p.border));
    const b = base.bounds();
    const w = b.max[0] - b.min[0];
    // barra embaixo garante que os palitos saiam de uma parte cheia do fundo
    const barW = Math.max(p.stakes > 1 ? w * 0.55 : STAKE_W * 2, STAKE_W * 2);
    const bar = k(k(M.CrossSection.square([barW, BAR_H], true)).translate([0, b.min[1] + BAR_H / 2 - 2]));
    const xs = p.stakes > 1 ? [-(barW / 2 - STAKE_W / 2), barW / 2 - STAKE_W / 2] : [0];
    const y0 = b.min[1] - 2;
    const stakes = xs.map((x) =>
      k(
        new M.CrossSection(
          [[[x - STAKE_W / 2, y0 + 1], [x - STAKE_W / 2, y0 - p.stakeLength + TIP], [x, y0 - p.stakeLength], [x + STAKE_W / 2, y0 - p.stakeLength + TIP], [x + STAKE_W / 2, y0 + 1]]],
          "NonZero",
        ),
      ),
    );
    const full = k(M.CrossSection.union([base, bar, ...stakes]));
    return {
      models: [
        {
          name: p.line1.trim(),
          parts: [
            { name: "Fundo", color: p.baseColor, mesh: slab(full, p.thickness) },
            { name: "Texto", color: p.textColor, mesh: slab(letters, p.relief, p.thickness) },
          ],
        },
      ],
    };
  });
}
