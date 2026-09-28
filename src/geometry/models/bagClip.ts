import { fitInto, scoped } from "../shape2d";
import { artParts, backing, requireArt, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type BagClipParams = {
  artWidth: number;
  gap: number; // folga da fenda (espessura do saco dobrado)
  base: number;
  relief: number;
  clipColor: string;
  artColor: string;
};

export const DEFAULT_BAG_CLIP: BagClipParams = { artWidth: 40, gap: 1.2, base: 2.4, relief: 1, clipColor: "#2563eb", artColor: "#ffffff" };

const FORK_L = 26.8;
const FORK_W = 14.9;
const FORK_H = 10;
const SLOT_L = 21;
const MOUTH = 2.4; // abertura extra na entrada da fenda (chanfro)
const BORDER = 2.4;
const OVERLAP = 3;

/**
 * Clipe de saco: forquilha com fenda (o saco dobrado entra nela) e o desenho como "cabeça" do lado fechado.
 * Impresso deitado: a fenda fica na vertical, sem suporte.
 */
export function buildBagClip(ctx: ModelCtx, p: BagClipParams): ModelOutput {
  const art = requireArt(ctx.art);
  const { M } = ctx;
  if (p.gap >= FORK_W - 4) throw new Error("Folga grande demais para a forquilha.");
  return scoped((k) => {
    const placed = k(fitInto(art, p.artWidth, p.artWidth, 0));
    const head = k(backing(M, placed, BORDER));
    const hb = head.bounds();
    const x0 = hb.max[0] - OVERLAP; // a forquilha começa dentro da cabeça
    const body = k(k(M.CrossSection.square([FORK_L, FORK_W], true)).translate([x0 + FORK_L / 2, (hb.min[1] + hb.max[1]) / 2]));
    const cy = (hb.min[1] + hb.max[1]) / 2;
    const xEnd = x0 + FORK_L;
    const g = p.gap / 2;
    const slot = k(
      new M.CrossSection(
        [[[xEnd - SLOT_L, cy - g], [xEnd - 1.5, cy - g], [xEnd + 0.1, cy - g - MOUTH], [xEnd + 0.1, cy + g + MOUTH], [xEnd - 1.5, cy + g], [xEnd - SLOT_L, cy + g]]],
        "NonZero",
      ),
    );
    const fork = k(k(body.subtract(slot)).extrude(FORK_H));
    const clip = k(fork.add(k(head.extrude(p.base))));
    return {
      models: [{ name: "Clipe de saco", parts: [{ name: "Clipe", color: p.clipColor, mesh: solidMesh(clip) }, ...artParts(ctx, placed, p.artColor, "Arte", p.relief, p.base)] }],
      warnings: [`Fenda de ${String(p.gap).replace(".", ",")} mm: para saco grosso, aumente a folga.`],
    };
  });
}
