import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";
import { slab, solidMesh, type ModelCtx, type ModelOutput, type TextFn } from "./common";
import { BED_MM } from "./gridCutter";

// ---------- Suporte de palitos (#65a) ----------

export type StickStandParams = {
  stickDiameter: number;
  clearance: number;
  holes: number;
  /** Distância entre os centros dos furos. */
  spacing: number;
  height: number;
  holeDepth: number;
  /** solid: maciço; light: oco por baixo (paredes a 45°, sem suporte); weight: bolsão para moedas/areia + tampa. */
  base: "solid" | "light" | "weight";
  wall: number;
  color: string;
};

export const DEFAULT_STICK_STAND: StickStandParams = {
  stickDiameter: 4,
  clearance: 0.4,
  holes: 12,
  spacing: 20,
  height: 25,
  holeDepth: 18,
  base: "light",
  wall: 2,
  color: "#f472b6",
};

const SEGMENTS = 96;
const LID_CLEARANCE = 0.15;
const LID_T = 2;

/** Anéis de furos do centro para fora, cada um com o máximo que cabe no espaçamento; o centro fica livre. */
export function holeRings(n: number, spacing: number): { radius: number; count: number }[] {
  const out: { radius: number; count: number }[] = [];
  let left = Math.max(1, Math.round(n));
  for (let k = 1; left > 0; k++) {
    const radius = k * spacing;
    const count = Math.min(left, Math.floor((2 * Math.PI * radius) / spacing));
    out.push({ radius, count });
    left -= count;
  }
  return out;
}

/** Suporte para palitos de pirulito, cake pop e topo de bolo: base redonda com furos em anéis. */
export function buildStickStand({ M }: ModelCtx, p: StickStandParams): ModelOutput {
  return scoped((k) => {
    const rings = holeRings(p.holes, p.spacing);
    const holeR = (p.stickDiameter + p.clearance) / 2;
    const R = rings[rings.length - 1].radius + p.spacing / 2 + p.wall;
    const H = p.height;
    const depth = Math.min(p.holeDepth, H - 1);
    const centers = rings.flatMap((r) => Array.from({ length: r.count }, (_, i) => [r.radius * Math.cos((2 * Math.PI * i) / r.count), r.radius * Math.sin((2 * Math.PI * i) / r.count)] as const));
    const at = (s: Solid, [x, y]: readonly [number, number], z = 0) => k(s.translate([x, y, z]));
    let body = k(M.Manifold.cylinder(H, R, R, SEGMENTS));
    const models = [];
    if (p.base === "light") {
      // cone oco por baixo (45°): imprime sem suporte; tubos maciços em volta de cada furo
      const inner = R - p.wall;
      const cavity = k(M.Manifold.cylinder(Math.min(inner, H - p.wall), inner, Math.max(inner - (H - p.wall), 0.01), SEGMENTS));
      const tube = k(M.Manifold.cylinder(H, holeR + p.wall, holeR + p.wall, 32));
      const tubes = k(M.Manifold.union(centers.map((c) => at(tube, c))));
      body = k(body.subtract(k(cavity.subtract(tubes))));
    } else if (p.base === "weight") {
      const pr = Math.max(5, rings[0].radius - holeR - 2 * p.wall);
      const pocketH = Math.max(3, Math.min(H - depth - p.wall, H * 0.6) - pr); // parte reta; o topo é cone a 45°
      const pocket = k(k(M.Manifold.cylinder(pocketH, pr, pr, SEGMENTS)).add(k(k(M.Manifold.cylinder(pr, pr, 0.01, SEGMENTS)).translate([0, 0, pocketH]))));
      body = k(body.subtract(pocket));
      const lid = k(k(M.Manifold.cylinder(LID_T, pr - LID_CLEARANCE, pr - LID_CLEARANCE, SEGMENTS)).translate([R + pr + 10, 0, 0]));
      models.push({ name: "Tampa do peso", parts: [{ name: "Tampa", color: p.color, mesh: solidMesh(lid) }] });
    }
    const hole = k(M.Manifold.cylinder(depth + 0.01, holeR, holeR, 32));
    body = k(body.subtract(k(M.Manifold.union(centers.map((c) => at(hole, c, H - depth))))));
    models.unshift({ name: "Suporte de palitos", parts: [{ name: "Suporte", color: p.color, mesh: solidMesh(body) }] });
    const warnings = 2 * R > BED_MM ? [`O suporte tem ${Math.round(2 * R)} mm: passa da mesa de ${BED_MM} mm. Diminua os furos ou o espaçamento.`] : [];
    return { models, warnings };
  });
}

// ---------- Boleira (#65b) ----------

export type CakeStandParams = {
  diameter: number;
  thickness: number;
  waves: number;
  waveDepth: number;
  height: number;
  columnDiameter: number;
  footDiameter: number;
  wall: number;
  name: string;
  nameSize: number;
  plateColor: string;
  nameColor: string;
};

export const DEFAULT_CAKE_STAND: CakeStandParams = {
  diameter: 180,
  thickness: 4,
  waves: 14,
  waveDepth: 4,
  height: 90,
  columnDiameter: 30,
  footDiameter: 110,
  wall: 2.5,
  name: "Ana",
  nameSize: 14,
  plateColor: "#fdf2f8",
  nameColor: "#db2777",
};

const FOOT_RIM = 3;
const MIN_COLUMN = 5;
const INLAY = 0.6;
const NAME_MARGIN = 5;
const SPACE_EM = 0.35;

/** Borda ondulada: raio R + a·cos(Nθ) (N = 0: círculo). */
function wavyDisc(M: ManifoldToplevel, R: number, waves: number, a: number): CS {
  const n = Math.max(SEGMENTS * 2, Math.round(waves) * 16);
  const pts: [number, number][] = Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    const r = R + (waves >= 1 ? a * Math.cos(Math.round(waves) * t) : 0);
    return [r * Math.cos(t), r * Math.sin(t)];
  });
  return new M.CrossSection([pts], "Positive");
}

/** Texto ao longo de um arco (em cima, lido de fora), letra por letra; null se vazio. */
export function textOnArc(M: ManifoldToplevel, text: TextFn, s: string, size: number, radius: number): CS | null {
  return scoped((k) => {
    const letters = [...s].map((ch) => {
      const cs = ch.trim() ? text(ch, size) : null;
      if (!cs) return { cs: null, w: size * SPACE_EM };
      k(cs);
      const b = cs.bounds();
      return { cs: k(cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2])), w: b.max[0] - b.min[0] + size * 0.08 };
    });
    if (!letters.some((l) => l.cs)) return null;
    const total = letters.reduce((t, l) => t + l.w, 0);
    let s0 = -total / 2;
    const placed: CS[] = [];
    for (const l of letters) {
      const mid = s0 + l.w / 2;
      s0 += l.w;
      if (!l.cs) continue;
      const phi = Math.PI / 2 - mid / radius;
      placed.push(k(k(l.cs.rotate(((phi - Math.PI / 2) * 180) / Math.PI)).translate([radius * Math.cos(phi), radius * Math.sin(phi)])));
    }
    return M.CrossSection.union(placed);
  });
}

/**
 * Boleira impressa numa peça, de cabeça para baixo: o prato fica na mesa, a coluna sobe e o pé abre em sino a 45°
 * (sem suporte). O nome vai embutido em 2 cores na face do prato que encosta na mesa (o topo quando em uso),
 * espelhado para ler certo depois de virar.
 */
export function buildCakeStand({ M, text }: ModelCtx, p: CakeStandParams): ModelOutput {
  return scoped((k) => {
    const warnings: string[] = [];
    const R = p.diameter / 2, colR = p.columnDiameter / 2;
    const maxFlare = p.height - p.thickness - FOOT_RIM - MIN_COLUMN;
    let footR = Math.max(p.footDiameter / 2, colR + p.wall);
    if (footR - colR > maxFlare) {
      footR = colR + Math.max(0, maxFlare);
      warnings.push(`O pé foi limitado a ${Math.round(2 * footR)} mm para abrir a 45° e imprimir sem suporte. Aumente a altura para um pé mais largo.`);
    }
    const flare = footR - colR;
    const columnTop = p.height - FOOT_RIM - flare;
    const plate2d = k(wavyDisc(M, R, p.waves, p.waveDepth));
    const plate = k(plate2d.extrude(p.thickness));
    const column = k(k(M.Manifold.cylinder(columnTop - p.thickness + 0.01, colR, colR, SEGMENTS)).translate([0, 0, p.thickness]));
    const bellOut = k(k(k(M.Manifold.cylinder(flare, colR, footR, SEGMENTS)).add(k(k(M.Manifold.cylinder(FOOT_RIM, footR, footR, SEGMENTS)).translate([0, 0, flare])))).translate([0, 0, columnTop]));
    const innerR = Math.max(colR - p.wall, 0.5);
    const bellIn = k(k(k(M.Manifold.cylinder(flare + 0.02, innerR, footR - p.wall, SEGMENTS)).add(k(k(M.Manifold.cylinder(FOOT_RIM + 0.02, footR - p.wall, footR - p.wall, SEGMENTS)).translate([0, 0, flare])))).translate([0, 0, columnTop + 0.01]));
    let body = k(k(M.Manifold.union([plate, column, bellOut])).subtract(bellIn));
    const parts = [];
    const arcText = p.name.trim() ? textOnArc(M, text, p.name, p.nameSize, R - p.nameSize / 2 - NAME_MARGIN) : null;
    let name: CS | null = null;
    if (arcText) {
      name = k(k(k(arcText).scale([-1, 1])).intersect(plate2d)); // espelhado: lê certo com a boleira virada
      body = k(body.subtract(k(name.extrude(INLAY))));
    }
    parts.push({ name: "Boleira", color: p.plateColor, mesh: solidMesh(body) });
    if (name && !name.isEmpty()) parts.push({ name: "Nome", color: p.nameColor, mesh: slab(name, INLAY) });
    const width = 2 * (R + p.waveDepth);
    if (width > BED_MM) warnings.push(`O prato tem ${Math.round(width)} mm: passa da mesa de ${BED_MM} mm. Diminua o diâmetro.`);
    return { models: [{ name: "Boleira", parts }], warnings };
  });
}
