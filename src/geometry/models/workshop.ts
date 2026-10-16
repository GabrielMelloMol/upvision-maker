import { bedMm } from "../bed";
import type { ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

const SEG = 128;
const GAP = 4;
const br = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

type K = <D extends { delete(): void }>(o: D) => D;

/** Sólido de revolução de um perfil (raio, altura), de pontos em sentido anti-horário. Quem chama dá delete(). */
function revolve(M: ManifoldToplevel, pts: [number, number][]): Solid {
  return scoped((k) => k(M.Manifold.revolve(k(new M.CrossSection([pts], "NonZero")), SEG)).translate([0, 0, 0]));
}

/** `n` cópias de `mesh` (função que devolve o sólido) em grade, para a mesma mesa. */
function grid(M: ManifoldToplevel, one: () => Solid, n: number, pitch: number, k: K): { solid: Solid; extent: number } {
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const parts = Array.from({ length: n }, (_, i) => k(one().translate([((i % cols) - (cols - 1) / 2) * pitch, (Math.floor(i / cols) - (rows - 1) / 2) * pitch, 0])));
  return { solid: n === 1 ? parts[0] : k(M.Manifold.union(parts)), extent: Math.max(cols, rows) * pitch - GAP };
}

// ---------------------------------------------------------------- tampa de ralo

export type DrainCoverParams = {
  /** Diâmetro do ralo (a abertura que a tampa fecha), mm. */
  drainD: number;
  /** Tampa que cobre; com pino que entra no ralo; ou com furos para escoar. */
  style: "cover" | "plug" | "strainer";
  /** Quanto a aba passa do ralo para cada lado. */
  overhang: number;
  thickness: number;
  /** Profundidade do pino (estilo "plug"). */
  plugDepth: number;
  clearance: number;
  knob: boolean;
  holeD: number;
  color: string;
};

export const DEFAULT_DRAIN_COVER: DrainCoverParams = { drainD: 50, style: "plug", overhang: 8, thickness: 3, plugDepth: 12, clearance: 0.4, knob: true, holeD: 4, color: "#0ea5e9" };

const KNOB_STEM_R = 4, KNOB_STEM_H = 6, KNOB_CAP_R = 11, KNOB_CAP_H = 3, KNOB_FLARE = 4;
const HOLE_EDGE = 5; // sem furo perto da borda e do botão

/**
 * Tampa de ralo (#231): disco que cobre o ralo (com aba para os lados), com pino que entra nele (a aba de baixo é um cone de 45°,
 * imprime sem suporte) ou com furos para a água escoar; botão de cogumelo opcional. Na posição de uso (botão para cima).
 */
export function buildDrainCover(ctx: ModelCtx, p: DrainCoverParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const R = p.drainD / 2 + p.overhang;
    const plugR = p.drainD / 2 - p.clearance;
    const plug = p.style === "plug";
    const depth = plug ? p.plugDepth : 0;
    // perfil: pino (raio plugR) de 0 a depth, cone de 45° até a aba (sem suporte), aba de espessura `thickness`
    const rise = R - plugR;
    const pts: [number, number][] = plug
      ? [[0, 0], [plugR, 0], [plugR, depth], [R, depth + rise], [R, depth + rise + p.thickness], [0, depth + rise + p.thickness]]
      : [[0, 0], [R, 0], [R, p.thickness], [0, p.thickness]];
    const top = plug ? depth + (R - plugR) + p.thickness : p.thickness;
    let body = k(revolve(M, pts));
    if (p.style === "strainer") {
      // furos em grade deslocada (favo), fora da borda e do botão
      const pitch = p.holeD * 1.9;
      const inner = R - HOLE_EDGE, keep = p.knob ? KNOB_CAP_R + 2 : 0;
      const holes: Solid[] = [];
      for (let row = -Math.ceil(inner / pitch); row <= Math.ceil(inner / pitch); row++)
        for (let col = -Math.ceil(inner / pitch); col <= Math.ceil(inner / pitch); col++) {
          const x = (col + (row % 2) / 2) * pitch, y = row * pitch * 0.866;
          const d = Math.hypot(x, y);
          if (d + p.holeD / 2 > inner || d < keep + p.holeD / 2) continue;
          holes.push(k(k(M.Manifold.cylinder(p.thickness + 2, p.holeD / 2, p.holeD / 2, 24)).translate([x, y, -1])));
        }
      if (!holes.length) warnings.push("Não coube nenhum furo: aumente o diâmetro do ralo ou diminua o furo.");
      else body = k(body.subtract(k(M.Manifold.union(holes))));
    }
    const parts = [body];
    if (p.knob) {
      const z0 = top;
      parts.push(
        k(k(M.Manifold.cylinder(KNOB_STEM_H, KNOB_STEM_R, KNOB_STEM_R, 48)).translate([0, 0, z0 - 0.01])),
        k(k(M.Manifold.cylinder(KNOB_FLARE, KNOB_STEM_R, KNOB_CAP_R, 48)).translate([0, 0, z0 + KNOB_STEM_H - 0.01])),
        k(k(M.Manifold.cylinder(KNOB_CAP_H, KNOB_CAP_R, KNOB_CAP_R, 48)).translate([0, 0, z0 + KNOB_STEM_H + KNOB_FLARE - 0.02])),
      );
    }
    const solid = k(M.Manifold.union(parts));
    if (2 * R > bedMm()) warnings.push(`A tampa tem ${Math.round(2 * R)} mm: passa da mesa de ${bedMm()} mm.`);
    if (plug && p.clearance < 0.2) warnings.push("Folga pequena: o pino pode não entrar no ralo (ralo de plástico varia). Teste num pedaço do pino antes.");
    return { models: [{ name: "Tampa de ralo", parts: [{ name: "Tampa", color: p.color, mesh: solidMesh(solid) }] }], warnings };
  });
}

// ---------------------------------------------------------------- funil

export type FunnelParams = { topD: number; neckD: number; coneH: number; neckLen: number; wall: number; bead: boolean; color: string };
export const DEFAULT_FUNNEL: FunnelParams = { topD: 90, neckD: 22, coneH: 60, neckLen: 35, wall: 1.6, bead: true, color: "#f59e0b" };

const BEAD_H = 3, BEAD_W = 2.5;

/**
 * Funil (#231): boca larga, cone e bico. Os diâmetros são os de fora; a parede é a mesma em tudo. Imprime de cabeça para baixo
 * (a boca larga na mesa, com a borda reforçada opcional); o cone de até 45° sai sem suporte.
 */
export function buildFunnel(ctx: ModelCtx, p: FunnelParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const rT = p.topD / 2, rN = p.neckD / 2, w = p.wall;
    const total = p.neckLen + p.coneH;
    const slope = ((rT - rN) / p.coneH) * 1; // raio por mm de altura: 1 = 45°
    if (slope > 1) warnings.push(`O cone passa de 45° (${br((Math.atan(slope) * 180) / Math.PI, 0)}°): imprime com suporte por dentro. Aumente a altura do cone ou diminua a boca.`);
    if (rN - w < 2) warnings.push("O bico ficou estreito para a parede: diminua a parede ou aumente o diâmetro do bico.");
    const outer: [number, number][] = [[rN, 0], [rN, p.neckLen], [rT, total]];
    const innerTop = rT - w;
    // anti-horário em (raio, altura): fora de baixo para cima, depois dentro de cima para baixo
    let pts: [number, number][] = [...outer, [innerTop, total], [rN - w, p.neckLen], [rN - w, 0]];
    if (p.bead) pts = [[rN, 0], [rN, p.neckLen], [rT, total - BEAD_H], [rT + BEAD_W, total - BEAD_H], [rT + BEAD_W, total], [innerTop, total], [rN - w, p.neckLen], [rN - w, 0]];
    const flipped = k(k(revolve(M, pts)).rotate([180, 0, 0]));
    const solid = k(flipped.translate([0, 0, total]));
    if (p.topD + (p.bead ? 2 * BEAD_W : 0) > bedMm()) warnings.push(`A boca tem ${Math.round(p.topD)} mm: passa da mesa de ${bedMm()} mm.`);
    return { models: [{ name: "Funil", parts: [{ name: "Funil", color: p.color, mesh: solidMesh(solid) }] }], warnings };
  });
}

// ---------------------------------------------------------------- O-ring

export type ORingParams = { innerD: number; cord: number; quantity: number; flat: boolean; color: string };
export const DEFAULT_ORING: ORingParams = { innerD: 20, cord: 3, quantity: 4, flat: true, color: "#1f2937" };

const FLAT_FRACTION = 0.12; // quanto da seção é achatado em cima e embaixo para imprimir

/**
 * O-ring (#231): anel de seção redonda, diâmetro interno × seção. Sai com o fundo e o topo levemente achatados (12% da seção)
 * para assentar na mesa; imprima em TPU. Várias na mesma mesa.
 */
export function buildORing(ctx: ModelCtx, p: ORingParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const R = p.innerD / 2 + p.cord / 2;
    const n = Math.max(1, Math.round(p.quantity));
    const flat = p.flat ? p.cord * FLAT_FRACTION : 0;
    const one = () => {
      const torus = k(M.Manifold.revolve(k(M.CrossSection.circle(p.cord / 2, 64).translate([R, 0])), SEG));
      const cut = k(M.Manifold.cube([4 * R + 4 * p.cord, 4 * R + 4 * p.cord, p.cord - 2 * flat], true));
      return k(k(torus.intersect(cut)).translate([0, 0, p.cord / 2 - flat]));
    };
    const { solid, extent } = grid(M, one, n, p.innerD + 2 * p.cord + GAP, k);
    if (p.innerD < 3 * p.cord) warnings.push("O diâmetro interno é pequeno para a seção: o anel fica duro de esticar e montar. Use uma seção mais fina.");
    if (p.cord < 1.2) warnings.push("Seção abaixo de 1,2 mm: o bico de 0,4 mm não faz bem. Imprima com bico menor ou compre o anel.");
    if (extent > bedMm()) warnings.push(`As ${n} peças ocupam ${Math.round(extent)} mm: passam da mesa de ${bedMm()} mm.`);
    warnings.push("Peça impressa em TPU serve para poeira, respingo e reposição leve; não garante vedação para pressão, óleo quente ou gás.");
    return { models: [{ name: n > 1 ? "O-rings" : "O-ring", parts: [{ name: "O-ring", color: p.color, mesh: solidMesh(solid) }] }], warnings };
  });
}

// ---------------------------------------------------------------- retentor

export type SealParams = { shaftD: number; housingD: number; width: number; interference: number; color: string };
export const DEFAULT_SEAL: SealParams = { shaftD: 20, housingD: 35, width: 7, interference: 0.4, color: "#374151" };

const OUTER_SQUEEZE = 0.2; // o corpo é um pouco maior que o alojamento: o TPU aperta e prende
const LIP_TIP = 0.6; // largura da ponta do lábio

/**
 * Retentor (#231): anel de TPU com lábio que encosta no eixo. Corpo no diâmetro do alojamento (+0,2 mm para prender), lábio com
 * folga negativa no eixo (aperta), lábio com 45° por baixo para imprimir sem suporte, na mesa pelo lado plano.
 */
export function buildSeal(ctx: ModelCtx, p: SealParams): ModelOutput {
  const { M } = ctx;
  return scoped(() => {
    const warnings: string[] = [];
    const rS = p.shaftD / 2, rH = p.housingD / 2 + OUTER_SQUEEZE;
    if (p.housingD < p.shaftD + 6) warnings.push("Pouca diferença entre o eixo e o alojamento: o corpo fica fino. Use um alojamento pelo menos 6 mm maior que o eixo.");
    const lipLen = Math.max(1, Math.min((rH - rS) * 0.3, (p.width - LIP_TIP) / 3)); // quanto o lábio sai da parede de dentro do corpo
    const bodyIn = rS + lipLen;
    const tip = rS - p.interference; // a ponta do lábio entra no eixo: aperta
    const zBot = lipLen + p.interference; // a parte de baixo do lábio sobe a 45°: sem suporte
    const zTop = zBot + LIP_TIP;
    // perfil (raio, altura) em sentido anti-horário: base na mesa, corpo, lado de dentro com o lábio de ponta cortada
    const pts: [number, number][] = [[bodyIn, 0], [rH, 0], [rH, p.width], [bodyIn, p.width], [bodyIn, Math.min(p.width, zTop + lipLen)], [tip, zTop], [tip, zBot]];
    const solid = revolve(M, pts);
    if (p.width < 3) warnings.push("Retentor muito fino: use 3 mm ou mais.");
    warnings.push("Retentor de TPU serve para graxa, poeira e respingo em eixo lento; não segura pressão nem óleo quente.");
    return { models: [{ name: "Retentor", parts: [{ name: "Retentor", color: p.color, mesh: solidMesh(solid) }] }], warnings };
  });
}
