import { bedMm } from "../bed";
import type { CS } from "../manifold";
import { scoped } from "../shape2d";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type SpacerParams = { innerD: number; outerD: number; thickness: number; quantity: number; color: string };
export const DEFAULT_SPACER: SpacerParams = { innerD: 8, outerD: 20, thickness: 3, quantity: 4, color: "#9ca3af" };

const MIN_WALL = 1.2;
const GAP = 3;
const SEG = 96;

/** Espaçador, calço ou arruela (#121): anel DI × DE × espessura, `quantity` peças em grade, todas na mesma mesa. */
export function buildSpacer(ctx: ModelCtx, p: SpacerParams): ModelOutput {
  const { M } = ctx;
  const warnings: string[] = [];
  let outerD = p.outerD;
  if (outerD < p.innerD + 2 * MIN_WALL) {
    outerD = p.innerD + 2 * MIN_WALL;
    warnings.push(`A parede ficou fina demais: o diâmetro externo subiu para ${outerD.toFixed(1)} mm (parede mínima de ${MIN_WALL} mm).`);
  }
  return scoped((k) => {
    const n = Math.max(1, Math.round(p.quantity));
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const pitch = outerD + GAP;
    const rings: CS[] = [];
    for (let i = 0; i < n; i++) {
      const x = ((i % cols) - (cols - 1) / 2) * pitch, y = (Math.floor(i / cols) - (rows - 1) / 2) * pitch;
      const ring = k(k(M.CrossSection.circle(outerD / 2, SEG)).subtract(k(M.CrossSection.circle(p.innerD / 2, SEG))));
      rings.push(k(ring.translate([x, y])));
    }
    const mesh = solidMesh(k(k(M.CrossSection.union(rings)).extrude(p.thickness)));
    const extent = Math.max(cols, rows) * pitch - GAP;
    if (extent > bedMm()) warnings.push(`As ${n} peças ocupam ${Math.round(extent)} mm: passam da mesa de ${bedMm()} mm. Diminua a quantidade ou imprima em mais de uma vez.`);
    return { models: [{ name: n > 1 ? "Arruelas" : "Arruela", parts: [{ name: "Arruela", color: p.color, mesh }] }], warnings };
  });
}
