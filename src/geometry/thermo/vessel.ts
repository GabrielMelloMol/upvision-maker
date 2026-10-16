import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { toMesh } from "../mesh";
import { scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { layoutRows } from "./layout";
import { DEFAULT_SCREEN, screenRegions } from "./screen";

type K = <D extends { delete(): void }>(o: D) => D;

type VesselKind = "pote" | "cesto";
/** Qual molde imprimir: só o macho (a tela é empurrada sobre ele), só a fêmea (uma tigela onde a tela é empurrada) ou o par que prensa. */
export type VesselMold = "male" | "female" | "both";

export type VesselParams = {
  kind: VesselKind;
  /** Diâmetro da boca do pote, altura da parede e ângulo de saída da parede (graus a partir da vertical). */
  mouthD: number;
  height: number;
  draft: number;
  /** Raio do canto entre o fundo e a parede. */
  cornerR: number;
  /** Espessura do disco de PLA. */
  t: number;
  /** Largura da borda sólida na boca (dá rigidez) e sobra do disco além da conta da planificação. */
  rim: number;
  margin: number;
  /** Malha (cesto) e fundo sólido dentro dela. */
  mesh: "honeycomb" | "diamond";
  aperture: number;
  wire: number;
  solidBase: boolean;
  mold: VesselMold;
  flange: number;
  flangeT: number;
  clearance: number;
  colors: { sheet: string; border: string; base: string; mold: string };
};

export const DEFAULT_VESSEL: VesselParams = {
  kind: "pote",
  mouthD: 80,
  height: 50,
  draft: 7,
  cornerR: 8,
  t: 1.2,
  rim: 5,
  margin: 6,
  mesh: "honeycomb",
  aperture: 2.5,
  wire: 1,
  solidBase: true,
  mold: "male",
  flange: 8,
  flangeT: 2,
  clearance: 0.3,
  colors: { sheet: "#0e7490", border: "#0e7490", base: "#0e7490", mold: "#3b82f6" },
};

/** Cesto: a mesma peça com a malha no lugar do plástico cheio. */
export const BASKET_VESSEL: Partial<VesselParams> = { kind: "cesto", mouthD: 90, height: 60, draft: 8, cornerR: 10, aperture: 3 };

export type VesselInfo = {
  /** Diâmetro do disco plano (conta da planificação + borda e sobra) e do fundo plano do molde. */
  discD: number;
  /** Comprimento do perfil da parede, do centro do fundo à boca. */
  profileLen: number;
  /** Diâmetro do fundo plano e altura do pote pronto. */
  flatTop: number;
  potH: number;
  cornerR: number;
  /** Quanto o disco passa da boca na aba plana, que descansa sobre o apoio do molde. */
  lip: number;
};

export type VesselOut = { screens: Model[]; molds: Model[]; assembled: Model; warnings: string[]; info: VesselInfo };

const SAMPLES_TOP = 8;
const SAMPLES_ARC = 28;
const SAMPLES_WALL = 24;
const MIN_FLAT = 2; // o fundo plano do molde tem pelo menos este raio
const MIN_DRAFT = 5; // abaixo disto o molde costuma prender
const MIN_CORNER = 3; // canto mais vivo que isto rasga a tela
const BASE_PAD = 2; // o fundo sólido passa um pouco do canto do molde
const TOP_THICK = 2; // teto da fêmea sobre a cavidade
const SEGMENTS = 120;

type Pt = [number, number];
export type VesselProfile = {
  pts: Pt[]; // (raio, altura) do centro do fundo (topo do molde) até a boca, na altura do apoio
  normals: Pt[]; // normal para fora do molde em cada ponto
  arc: number[]; // comprimento acumulado
  total: number;
  Rm: number;
  flatTop: number;
  rf: number;
};

/**
 * Perfil do molde macho em (raio, altura): fundo plano no topo, canto arredondado e parede reta com ângulo de saída, até a boca em z = 0.
 * O canto é encolhido se não couber (o fundo plano sempre fica com um raio mínimo).
 */
export function vesselProfile(p: Pick<VesselParams, "mouthD" | "height" | "draft" | "cornerR">): VesselProfile {
  const Rm = p.mouthD / 2, H = p.height, a = (p.draft * Math.PI) / 180;
  const flatFor = (rf: number) => Rm - (rf + (H - rf) * Math.sin(a)) / Math.cos(a);
  let rf = Math.min(p.cornerR, H * 0.95);
  while (rf > 0 && flatFor(rf) < MIN_FLAT) rf = Math.max(0, rf - 0.25);
  const cx = Math.max(MIN_FLAT, flatFor(rf));
  const pts: Pt[] = [];
  const normals: Pt[] = [];
  for (let i = 0; i <= SAMPLES_TOP; i++) {
    pts.push([(cx * i) / SAMPLES_TOP, H]);
    normals.push([0, 1]);
  }
  for (let i = 1; i <= SAMPLES_ARC; i++) {
    const th = Math.PI / 2 - (i / SAMPLES_ARC) * (Math.PI / 2 - a); // do topo (90°) à parede (α)
    pts.push([cx + rf * Math.cos(th), H - rf + rf * Math.sin(th)]);
    normals.push([Math.cos(th), Math.sin(th)]);
  }
  const [wx, wy] = pts[pts.length - 1];
  for (let i = 1; i <= SAMPLES_WALL; i++) {
    const u = i / SAMPLES_WALL;
    pts.push([wx + (Rm - wx) * u, wy * (1 - u)]);
    normals.push([Math.cos(a), Math.sin(a)]);
  }
  const arc: number[] = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, normals, arc, total: arc[arc.length - 1], Rm, flatTop: cx, rf };
}

/** Ponto da superfície a `s` mm do centro do fundo, ao longo do perfil; passando da boca, a aba plana sobre o apoio. */
export function profileAt(pr: VesselProfile, s: number): { rho: number; z: number; nr: number; nz: number } {
  if (s >= pr.total) return { rho: pr.Rm + (s - pr.total), z: 0, nr: 0, nz: 1 };
  let lo = 1, hi = pr.arc.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pr.arc[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  const u = (s - pr.arc[lo - 1]) / Math.max(1e-9, pr.arc[lo] - pr.arc[lo - 1]);
  const [x0, y0] = pr.pts[lo - 1], [x1, y1] = pr.pts[lo];
  const [n0, m0] = pr.normals[lo - 1], [n1, m1] = pr.normals[lo];
  const nr = n0 + (n1 - n0) * u, nz = m0 + (m1 - m0) * u;
  const len = Math.hypot(nr, nz) || 1;
  return { rho: x0 + (x1 - x0) * u, z: y0 + (y1 - y0) * u, nr: nr / len, nz: nz / len };
}

/** Raio do disco plano: o comprimento do perfil (fundo + canto + parede) mais a aba da boca e a sobra. */
export const discRadius = (pr: VesselProfile, p: Pick<VesselParams, "rim" | "margin">) => pr.total + p.rim + p.margin;

const WARP_MM = 1;

/** Deforma o disco plano (com a face de baixo em z = 0) sobre o molde: cada ponto a r do centro vai para a distância r ao longo do perfil e a espessura segue a normal. */
function warpOntoVessel(flat: Solid, pr: VesselProfile, k: K): Solid {
  const fine = k(flat.refineToLength(WARP_MM));
  return fine.warpBatch((v, n) => {
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const x = v[o], y = v[o + 1], zf = v[o + 2];
      const r = Math.hypot(x, y);
      const at = profileAt(pr, r);
      const R = at.rho + at.nr * zf;
      v[o] = r > 1e-9 ? (R * x) / r : 0;
      v[o + 1] = r > 1e-9 ? (R * y) / r : 0;
      v[o + 2] = at.z + at.nz * zf;
    }
  });
}

const profilePolygon = (pr: VesselProfile): Pt[] => [[0, 0], [pr.Rm, 0], ...[...pr.pts].reverse().filter(([x, y]) => !(x === pr.Rm && y === 0)), [0, pr.pts[0][1]]];

const solidPart = (name: string, color: string, s: Solid | null): Part[] => (s ? [{ name, color, mesh: toMesh(s) }] : []);
const extruded = (cs: CS, h: number, k: K): Solid | null => (cs.isEmpty() ? null : k(cs.extrude(h)));

/**
 * Pote ou cesto termoformado: um disco de PLA (sólido ou em malha, com borda sólida) aquecido e empurrado sobre um molde macho em
 * tronco de cone com canto arredondado, ou dentro de uma fêmea, ou prensado entre os dois (folga = espessura + folga).
 * O disco tem o diâmetro da planificação: o comprimento do perfil do fundo à boca, mais a aba e a sobra.
 */
export function buildVessel(M: ManifoldToplevel, p: VesselParams, opts: { preview?: boolean } = {}): VesselOut {
  const preview = opts.preview ?? true;
  return scoped((k) => {
    const warnings: string[] = [];
    const pr = vesselProfile(p);
    if (p.draft < MIN_DRAFT) warnings.push(`O ângulo de saída de ${p.draft.toString().replace(".", ",")}° é pequeno: o molde pode prender o pote. Use ${MIN_DRAFT}° ou mais.`);
    if (pr.rf < Math.min(p.cornerR, MIN_CORNER)) warnings.push("O canto do fundo ficou muito vivo para o pote caber: aumente o diâmetro, diminua a altura ou o ângulo.");
    else if (pr.rf < p.cornerR - 0.01) warnings.push(`O raio do canto foi reduzido para ${pr.rf.toFixed(1).replace(".", ",")} mm para o fundo plano caber no molde.`);
    else if (p.cornerR < MIN_CORNER) warnings.push("Um canto tão vivo rasga a tela quando ela estica: use 3 mm ou mais de raio.");
    if (p.rim > p.margin) warnings.push("A borda sólida é mais larga que a sobra do disco: ela entra na parede, e a parede sólida não amolece. Aumente a sobra ou diminua a borda.");

    const R = discRadius(pr, p);
    const e = p.mold === "both" ? p.t + p.clearance : 0;
    const disc = k(M.CrossSection.circle(R, SEGMENTS));
    const parts: Part[] = [];
    let flatSolid: { border: CS; mesh: CS; base: CS };
    if (p.kind === "pote") {
      const inner = k(M.CrossSection.circle(R - p.rim, SEGMENTS));
      flatSolid = { border: k(disc.subtract(inner)), mesh: inner, base: k(M.CrossSection.square([0.001, 0.001])) };
    } else {
      const base = p.solidBase ? k(M.CrossSection.circle(pr.flatTop + pr.rf + BASE_PAD, SEGMENTS)) : null;
      const reg = screenRegions(M, disc, base, { ...DEFAULT_SCREEN, border: p.rim, mesh: p.mesh, aperture: p.aperture, wire: p.wire }, k);
      flatSolid = { border: k(reg.border), mesh: k(reg.mesh), base: k(reg.design) };
    }
    const c = p.colors;
    parts.push(...solidPart("Borda", c.border, extruded(flatSolid.border, p.t, k)), ...solidPart(p.kind === "pote" ? "Disco" : "Malha", c.sheet, extruded(flatSolid.mesh, p.t, k)));
    if (p.kind === "cesto" && p.solidBase) parts.push(...solidPart("Fundo", c.base, extruded(flatSolid.base, p.t, k)));
    const screens = [{ name: p.kind === "pote" ? "Disco do pote" : "Disco do cesto", parts }];

    // moldes: o macho tem apoio (a aba plana do disco descansa nele); a fêmea é o bloco com a cavidade, de boca para cima
    const poly = profilePolygon(pr);
    const profileCs = k(new M.CrossSection([poly], "NonZero"));
    const body = k(M.Manifold.revolve(profileCs, SEGMENTS));
    const apoioR = pr.Rm + p.flange + p.margin;
    const male = k(M.Manifold.union([k(M.Manifold.cylinder(p.flangeT, apoioR, apoioR, SEGMENTS)), k(body.translate([0, 0, p.flangeT - 0.01]))]));
    const cavityCs = e > 0 ? k(profileCs.offset(e, "Round")) : profileCs;
    const cavity = k(k(M.Manifold.revolve(cavityCs, SEGMENTS)).translate([0, 0, p.flangeT - 0.01]));
    const rim = p.flangeT + p.t;
    const top = p.flangeT + p.height + e + TOP_THICK;
    const block = k(k(M.Manifold.cylinder(top - rim, apoioR, apoioR, SEGMENTS)).translate([0, 0, rim]));
    const femaleInPlace = k(block.subtract(cavity));
    const female = k(k(femaleInPlace.mirror([0, 0, 1])).translate([0, 0, top]));
    const moldRow: Model[] = [];
    if (p.mold !== "female") moldRow.push({ name: "Molde macho", parts: [{ name: "Molde macho", color: c.mold, mesh: toMesh(male) }] });
    if (p.mold !== "male") moldRow.push({ name: "Molde fêmea", parts: [{ name: "Molde fêmea", color: c.mold, mesh: toMesh(female) }] });
    const molds = layoutRows([moldRow], 10);

    let assembled: Model = { name: "Pote pronto (não imprime)", previewOnly: true, parts: [] };
    if (preview) {
      // o disco é cortado na boca (r = comprimento do perfil) antes de deformar: a emenda do perfil com a aba cai numa aresta, sem dentes
      const inside = k(M.CrossSection.circle(pr.total, SEGMENTS)), outside = k(disc.subtract(inside));
      const warp = (cs: CS): Solid | null => {
        if (cs.isEmpty()) return null;
        const halves = [k(cs.intersect(inside)), k(cs.intersect(outside))].filter((h) => !h.isEmpty()).map((h) => warpOntoVessel(k(h.extrude(p.t)), pr, k));
        return halves.length ? k(M.Manifold.union(halves)) : null;
      };
      const formed = [["Borda", c.border, warp(flatSolid.border)], [parts[1].name, c.sheet, warp(flatSolid.mesh)], ["Fundo", c.base, p.kind === "cesto" && p.solidBase ? warp(flatSolid.base) : null]] as const;
      // de pé: a boca para cima (o molde vira o pote de cabeça para baixo)
      const upright = (s: Solid | null) => (s ? k(k(s.mirror([0, 0, 1])).translate([0, 0, p.height + p.t])) : null);
      assembled = { name: "Pote pronto (não imprime)", previewOnly: true, parts: formed.flatMap(([n, col, s]) => solidPart(n, col, upright(s))) };
    }

    const info: VesselInfo = { discD: 2 * R, profileLen: pr.total, flatTop: 2 * pr.flatTop, potH: p.height + p.t, cornerR: pr.rf, lip: p.rim + p.margin };
    return { screens, molds, assembled, warnings, info };
  });
}
