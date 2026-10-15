import { nozzleText } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { toMesh } from "../mesh";
import { scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { fixThinStrokes } from "../stampArt";
import { inradius, stretchOf, type DomeGeo } from "./dome";
import { buildMoldSolid, DEFAULT_MOLD, type MoldParams } from "./mold";
import { mergeMeshes, warpOntoDome } from "./preview";
import { clipRegion, DEFAULT_SCREEN, earOf, ringRegion, screenRegions, type ScreenParams } from "./screen";

type K = <D extends { delete(): void }>(o: D) => D;

export type ThermoColors = { sheet: string; border: string; design: string; mold: string; clip: string };
const DEFAULT_COLORS: ThermoColors = { sheet: "#1f7a4d", border: "#1f7a4d", design: "#f4f4f2", mold: "#3b82f6", clip: "#1f7a4d" };

export type ThermoParams = {
  /** Altura do domo do molde e curvatura (expoente da superelipse). */
  domeH: number;
  curve: number;
  /** Encolhe o desenho da tela plana pelo esticamento, para sair do tamanho pedido depois de prensada. */
  compensate: boolean;
  mold: MoldParams;
  screen: ScreenParams;
  colors: ThermoColors;
  /** O desenho vai nas duas metades; senão, só na de cima. */
  designOnBoth: boolean;
  /** Engrossa os traços do desenho mais finos que o bico (sempre avisa). */
  thickenDesign: boolean;
};

export const DEFAULT_THERMO: ThermoParams = { domeH: 10, curve: 2.2, compensate: true, mold: DEFAULT_MOLD, screen: DEFAULT_SCREEN, colors: DEFAULT_COLORS, designOnBoth: true, thickenDesign: true };

export type ThermoInfo = {
  /** Quanto a tela estica (comprimento do perfil do domo ÷ distância da borda ao topo). */
  stretch: number;
  /** Abertura da malha depois de esticada, no topo do domo (mm). */
  apertureAfter: number;
  /** Escala aplicada ao desenho da tela plana (1 = sem compensar). */
  designScale: number;
  /** Maior recuo do contorno: define até onde o domo sobe. */
  inradius: number;
};

export type ThermoOut = {
  /** As duas telas e o fecho (clipe ou faixa), lado a lado na mesa, em PLA. */
  screens: Model[];
  /** Molde em PETG, centrado na origem (outro arquivo). */
  mold: Model;
  /** A caixa montada e curvada (só prévia). */
  assembled: Model;
  warnings: string[];
  info: ThermoInfo;
};

const GAP = 10;
const CLOSURE_GAP = 22;
const STRETCH_WARN = 1.4;
const DESIGN_LOSS_WARN = 0.05;
const COMP_MIN = 0.6;
const COMP_SAMPLES = 8;
const MIN_DOME = 6;
const NECK_MM = 5; // pontas do miolo mais estreitas que 2 × isto não viram domo

const meshOf = (cs: CS, height: number, dx: number, dy: number, k: K) => (cs.isEmpty() ? null : toMesh(k(k(cs.extrude(height)).translate([dx, dy, 0]))));
const part = (name: string, color: string, cs: CS, height: number, dx: number, dy: number, k: K): Part[] => {
  const mesh = meshOf(cs, height, dx, dy, k);
  return mesh ? [{ name, color, mesh }] : [];
};

const maxRadius = (cs: CS) => Math.max(0, ...cs.toPolygons().flat().map(([x, y]) => Math.hypot(x, y)));

/** Encolhe o desenho pela média da ampliação do domo ao longo do desenho (do centro até a borda dele). */
function compensation(design: CS, magnification: (r: number) => number): number {
  const r = maxRadius(design);
  const mean = Array.from({ length: COMP_SAMPLES + 1 }, (_, i) => magnification((r * i) / COMP_SAMPLES)).reduce((a, b) => a + b, 0) / (COMP_SAMPLES + 1);
  return Math.min(1, Math.max(COMP_MIN, 1 / mean));
}

const scaled = (cs: CS, s: number, k: K) => (s === 1 ? cs : k(cs.scale(s)));

/** Duas telas (PLA), o molde (PETG) e a caixa montada, a partir da silhueta simétrica e do desenho de cima (já centrado, em mm). */
export function buildThermo(M: ManifoldToplevel, sil: CS, design: CS | null, p: ThermoParams): ThermoOut {
  return scoped((k) => {
    const warnings: string[] = [];
    const inner = k(sil.offset(-p.screen.border, "Round")); // o miolo em malha: dentro da borda sólida
    // o domo nasce no limite interno da borda, sem as pontas finas do miolo (o pescoço da bola de Natal): elas ficam planas
    const base = k(k(inner.offset(-NECK_MM, "Round")).offset(NECK_MM, "Round"));
    const L = inradius(base);
    const H = Math.max(MIN_DOME, p.domeH);
    const g: DomeGeo = { L, H, q: p.curve };
    const { S, magnification } = stretchOf(g);
    if (S > STRETCH_WARN) warnings.push(`A tela estica ${S.toFixed(2).replace(".", ",")}× ao ser prensada: a malha abre demais e pode rasgar. Diminua a altura do domo ou use uma curvatura maior.`);
    const dScale = design && p.compensate ? compensation(design, magnification) : 1;
    let flatDesign = design ? scaled(design, dScale, k) : null;
    if (flatDesign) {
      // o traço fino conta na tela plana, já no tamanho que vai ser impresso
      const thin = fixThinStrokes(M, flatDesign, p.thickenDesign);
      flatDesign = k(thin.cs);
      if (thin.thin) warnings.push(thin.fixed ? "Havia traços do desenho mais finos que o bico da impressora e eu os engrossei para a tela sair inteira." : "O desenho tem traços mais finos que o bico da impressora: eles falham na tela. Engrosse o desenho ou aumente a caixinha.");
    }
    const lost = design && flatDesign ? 1 - k(flatDesign.intersect(k(sil.offset(-p.screen.border, "Round")))).area() / Math.max(1e-9, flatDesign.area()) : 0;
    if (lost > DESIGN_LOSS_WARN) warnings.push("O desenho passa da área da tela e foi cortado na borda: diminua o desenho ou aumente a silhueta.");

    const ear = p.screen.closure === "clip" ? earOf(M, sil, p.screen, k) : null;
    const reg = screenRegions(M, sil, flatDesign, p.screen, k, ear);
    k(reg.border); k(reg.mesh); k(reg.design);
    const sb = ear ? k(M.CrossSection.union([sil, ear])).bounds() : sil.bounds();
    const W = sb.max[0] - sb.min[0], Hs = sb.max[1] - sb.min[1];
    const cy = (sb.max[1] + sb.min[1]) / 2;
    const t = p.screen.t;
    const c = p.colors;
    const screen = (n: number, dx: number, withDesign: boolean): Model => ({
      name: `Tela ${n}`,
      parts: [...part("Borda", c.border, reg.border, t, dx, -cy, k), ...part("Malha", c.sheet, reg.mesh, t, dx, -cy, k), ...(withDesign ? part("Design", c.design, reg.design, t, dx, -cy, k) : [])],
    });
    const second = p.designOnBoth;
    // sem desenho numa metade, o espaço do desenho vira malha
    const plainReg = !second && flatDesign ? screenRegions(M, sil, null, p.screen, k, ear) : null;
    const dx = W / 2 + GAP / 2;
    const screens: Model[] = [screen(1, -dx, true)];
    if (plainReg) {
      k(plainReg.border); k(plainReg.mesh); k(plainReg.design);
      screens.push({ name: "Tela 2", parts: [...part("Borda", c.border, plainReg.border, t, dx, -cy, k), ...part("Malha", c.sheet, plainReg.mesh, t, dx, -cy, k)] });
    } else screens.push(screen(2, dx, true));

    const below = -(Hs / 2 + CLOSURE_GAP);
    if (p.screen.closure === "clip") {
      const clip = clipRegion(M, p.screen, k);
      screens.push({ name: "Clipe", parts: part("Clipe", c.clip, clip, p.screen.clipT, 0, below, k) });
    } else if (p.screen.closure === "ring") {
      const ring = ringRegion(sil, p.screen, k);
      const rb = ring.bounds();
      screens.push({ name: "Faixa externa", parts: part("Faixa", c.clip, ring, p.screen.ringH, -(rb.min[0] + rb.max[0]) / 2, below - (rb.min[1] + rb.max[1]) / 2 - (rb.max[1] - rb.min[1]) / 2, k) });
    }

    const mold = buildMoldSolid(M, base, g, p.mold, k, sil);
    const moldModel: Model = { name: "Molde", parts: [{ name: "Molde", color: c.mold, mesh: toMesh(mold) }] };

    // caixa montada: a tela plana deformada sobre o domo (como a termoformagem faz), uma metade de cabeça para baixo sobre a outra
    const formed = (r: { border: CS; mesh: CS; design: CS }) => {
      const warp = (cs: CS) => (cs.isEmpty() ? null : warpOntoDome(k(cs.extrude(t)), base, g, k));
      return { border: warp(r.border), mesh: warp(r.mesh), design: warp(r.design) };
    };
    const top = formed(reg);
    const bot = plainReg ? formed(plainReg) : top;
    const flip = (s: Solid) => k(s.mirror([0, 0, 1]));
    const merged = (name: string, color: string, a: Solid | null, b: Solid | null): Part[] => {
      const meshes = [a && toMesh(a), b && toMesh(flip(b))].filter((m): m is NonNullable<typeof m> => !!m);
      return meshes.length ? [{ name, color, mesh: mergeMeshes(meshes) }] : [];
    };
    const yBox = Hs + 32;
    const place = (parts: Part[]): Part[] => parts.map((q) => ({ ...q, mesh: { ...q.mesh, positions: q.mesh.positions.map((v, i) => (i % 3 === 1 ? v + yBox - cy : v)) } }));
    const assembled: Model = {
      name: "Caixa montada (não imprime)",
      previewOnly: true,
      parts: place([...merged("Borda", c.border, top.border, bot.border), ...merged("Malha", c.sheet, top.mesh, bot.mesh), ...merged("Design", c.design, top.design, bot.design)]),
    };

    const info: ThermoInfo = { stretch: S, apertureAfter: p.screen.aperture * S, designScale: dScale, inradius: L };
    if (p.screen.aperture * S > 2 * p.screen.aperture) warnings.push(`A malha abre até ${(p.screen.aperture * S).toFixed(1).replace(".", ",")} mm depois de prensada (o furo de ${nozzleText(p.screen.aperture)} mm estica junto).`);
    return { screens, mold: moldModel, assembled, warnings, info };
  });
}
