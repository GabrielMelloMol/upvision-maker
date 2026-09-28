import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";
import { backing, MissingInput, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type ArticulatedNameParams = {
  text: string;
  textHeight: number;
  body: number; // espessura das peças (altura da dobradiça)
  relief: number;
  radial: number; // folga radial da dobradiça
  axial: number; // folga axial (entre as "tampas" do pino e o anel)
  baseColor: string;
  textColor: string;
};

export const DEFAULT_ARTICULATED: ArticulatedNameParams = { text: "SOFIA", textHeight: 16, body: 6, relief: 1, radial: 0.3, axial: 0.4, baseColor: "#7e3fd6", textColor: "#ffffff" };

const PIN_R = 1.8;
const CAP_R = 3.2; // cones a 45°: imprimem sem suporte e prendem o anel em cima e embaixo
const FLANGE = 0.6;
const RING_WALL = 1.2;
const ARM_W = 2.4;
const OPEN_DEG = 60; // meia abertura do anel (por onde passa o braço do pino)
const TILE_GAP = 0.6;
const BORDER = 2;
const TAB_R = 4;
const TAB_HOLE = 2;
const MAX_LETTERS = 14;

/** Perfil (raio, z) do pino com os cones de retenção; `c` alarga o perfil (vira o vão dentro do anel). */
function pinProfile(M: ManifoldToplevel, H: number, c: number, axial: number): CS {
  const hc = CAP_R - PIN_R;
  const pts: [number, number][] = [
    [0, -1],
    [CAP_R, -1],
    [CAP_R, FLANGE],
    [PIN_R, FLANGE + hc],
    [PIN_R, H - FLANGE - hc],
    [CAP_R, H - FLANGE],
    [CAP_R, H + 1],
    [0, H + 1],
  ];
  const base = new M.CrossSection([pts], "NonZero");
  if (!c) return base;
  // a folga axial dos cones a 45° é c·√2; ajusta o offset para bater com a pedida
  const out = base.offset(Math.max(c, axial / Math.SQRT2), "Miter");
  base.delete();
  return out;
}

/** Junta entre a peça i (pino) e a i+1 (anel em C) centrada em (x, 0). */
function joint(M: ManifoldToplevel, k: <D extends { delete(): void }>(o: D) => D, x: number, p: ArticulatedNameParams) {
  const H = p.body;
  const clip = k(M.CrossSection.square([20, H], false)); // corta o perfil em z ∈ [0, H]
  const pin = k(k(k(k(pinProfile(M, H, 0, 0)).intersect(clip)).revolve(48)).translate([x, 0, 0]));
  const vr = k(pinProfile(M, H, p.radial, p.axial));
  const void_ = k(k(k(vr.intersect(k(M.CrossSection.square([20, H + 2], false).translate([0, -1])))).revolve(48)).translate([x, 0, 0]));
  const rOut = CAP_R + p.radial + RING_WALL;
  const t = Math.tan((OPEN_DEG * Math.PI) / 180) * 20;
  const wedge = k(k(new M.CrossSection([[[x, 0], [x - 20, t], [x - 20, -t]]], "NonZero").extrude(H + 2)).translate([0, 0, -1]));
  const ring = k(k(k(k(M.Manifold.cylinder(H, rOut, rOut, 48)).translate([x, 0, 0])).subtract(void_)).subtract(wedge));
  return { pin, ring, rOut };
}

/**
 * Chaveiro de nome articulado: cada letra numa peça, ligadas por dobradiças já montadas (pino com cones + anel em C).
 * Imprime deitado, de uma vez, sem suporte; depois de solto na mesa, as letras balançam.
 */
export function buildArticulatedName({ M, text }: ModelCtx, p: ArticulatedNameParams): ModelOutput {
  const chars = [...p.text.replace(/\s+/g, "")].slice(0, MAX_LETTERS);
  if (!chars.length) throw new MissingInput("Digite o nome.");
  if (p.body < 2 * (FLANGE + CAP_R - PIN_R) + 1) throw new Error("Peças finas demais para a dobradiça: use 5 mm ou mais.");
  return scoped((k) => {
    const H = p.body;
    const letters: CS[] = [];
    const bodies: Solid[] = [];
    let cursor = 0;
    let pendingRing: { ring: Solid; x: number; rOut: number } | null = null;
    chars.forEach((ch, i) => {
      const raw = text(ch, p.textHeight);
      if (!raw) return;
      const g = k(raw);
      const tile0 = k(backing(M, g, BORDER));
      const tb = tile0.bounds();
      const dx = cursor - tb.min[0];
      const tile = k(tile0.translate([dx, 0]));
      letters.push(k(g.translate([dx, 0])));
      const cx = (tb.min[0] + tb.max[0]) / 2 + dx;
      let solid = k(tile.extrude(H));
      if (pendingRing) {
        // o anel da junta anterior pertence a esta peça: braço do anel até o meio da letra
        const from = pendingRing.x + CAP_R + p.radial + 0.4;
        const arm = k(k(M.Manifold.cube([cx - from, ARM_W, H], false)).translate([from, -ARM_W / 2, 0]));
        solid = k(M.Manifold.union([solid, pendingRing.ring, arm]));
      }
      if (i === 0) {
        const c: [number, number] = [tb.min[0] + dx - TAB_R + 1.5, 0];
        const tab = k(k(k(M.CrossSection.circle(TAB_R, 32)).translate(c)).subtract(k(k(M.CrossSection.circle(TAB_HOLE, 24)).translate(c))));
        solid = k(solid.add(k(tab.extrude(H))));
      }
      const last = i === chars.length - 1;
      if (!last) {
        const rOut = CAP_R + p.radial + RING_WALL;
        const jx = tb.max[0] + dx + TILE_GAP + rOut;
        const j = joint(M, k, jx, p);
        const arm = k(k(M.Manifold.cube([jx - cx, ARM_W, H], false)).translate([cx, -ARM_W / 2, 0]));
        solid = k(M.Manifold.union([solid, j.pin, arm]));
        pendingRing = { ring: j.ring, x: jx, rOut };
        cursor = jx + rOut - 0.5;
      }
      bodies.push(solid);
    });
    const all = k(M.Manifold.union(bodies)); // peças separadas numa malha só (uma cor)
    const b = all.boundingBox();
    const shift = -(b.min[0] + b.max[0]) / 2;
    const top = k(k(M.CrossSection.union(letters)).translate([shift, 0]));
    return {
      models: [
        {
          name: p.text.trim(),
          parts: [
            { name: "Peças", color: p.baseColor, mesh: solidMesh(k(all.translate([shift, 0, 0]))) },
            { name: "Letras", color: p.textColor, mesh: slab(top, p.relief, H) },
          ],
        },
      ],
      warnings: [`Dobradiça com folga de ${String(p.radial).replace(".", ",")} mm: imprima um teste; se as letras grudarem, aumente a folga.`],
    };
  });
}
