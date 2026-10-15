import type { CS } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { caseLayout, DEFAULT_SCREW_CASE, screwCaseClosed, type ScrewCaseParams } from "./screwCase";

export type AromaParams = {
  /** Diâmetro do feltro (disco de aroma), mm; a cavidade tem 1 mm a mais. */
  feltDiameter: number;
  feltThickness: number;
  wall: number;
  floor: number;
  /** Folga da rosca entre o corpo e a tampa. */
  clearance: number;
  /** Furos de aroma na tampa (em volta do logo). */
  holes: number;
  holeDiameter: number;
  /** Logo em relevo no meio da tampa: texto (se não houver desenho). */
  text: string;
  logoSize: number;
  relief: number;
  /** Olhal para argola/cordão no corpo. */
  keyring: boolean;
  /** "test": só a rosca num tamanho pequeno, para conferir a folga antes da peça inteira. */
  print: "full" | "test";
  bodyColor: string;
  lidColor: string;
  logoColor: string;
};

export const DEFAULT_AROMA: AromaParams = {
  feltDiameter: 30,
  feltThickness: 3,
  wall: 1.6,
  floor: 1.6,
  clearance: 0.35,
  holes: 8,
  holeDiameter: 2,
  text: "Ana",
  logoSize: 14,
  relief: 0.8,
  keyring: true,
  print: "full",
  bodyColor: "#1c1c1e",
  lidColor: "#f5f5f7",
  logoColor: "#e11d48",
};

const FELT_FIT = 1; // a cavidade é maior que o feltro (mm)
const AIR = 3; // espaço acima do feltro para pingar o óleo (mm)
const PITCH = 2.5;
const THREAD_DEPTH = 1;
const TEST_DIAMETER = 8; // cavidade do teste da rosca (mm)
const EAR = 12;
const EAR_JOIN = 3; // quanto o olhal entra na parede do corpo (fora da cavidade)
const EAR_REACH = 2 * EAR - EAR_JOIN; // quanto o olhal passa da parede
const EAR_HOLE = 4;
const EAR_THICK = 3;
const GAP = 10;
const HOLE_MARGIN = 1.5; // parede mínima entre o furo de aroma e a rosca / o logo
const MIN_HOLES = 3;

/** Parâmetros do Estojo com tampa de rosca que dão a cápsula: a mesma rosca, só mais rasa e sem nome. */
export function aromaCase(p: AromaParams): ScrewCaseParams {
  const test = p.print === "test";
  return {
    ...DEFAULT_SCREW_CASE,
    innerDiameter: test ? TEST_DIAMETER : p.feltDiameter + FELT_FIT,
    innerHeight: p.feltThickness + AIR,
    wall: p.wall,
    floor: p.floor,
    pitch: PITCH,
    threadDepth: THREAD_DEPTH,
    clearance: p.clearance,
    starts: 2,
    turns: 1,
    nameMode: "none",
    texture: "smooth",
    keyring: false,
  };
}

/** Centros dos furos de aroma: um anel entre o logo e a rosca (sem furo no meio, o logo ocupa). */
export function holeCenters(p: AromaParams, ringRadius: number): [number, number][] {
  return Array.from({ length: Math.max(MIN_HOLES, Math.round(p.holes)) }, (_, i) => {
    const a = (2 * Math.PI * i) / Math.max(MIN_HOLES, Math.round(p.holes));
    return [ringRadius * Math.cos(a), ringRadius * Math.sin(a)];
  });
}

/**
 * Chaveiro aromatizador (#219): cápsula de rosca (a do Estojo) com cavidade para o feltro no corpo, tampa com furos de
 * aroma em anel e logo em relevo no meio, e olhal. A tampa sai de pé (aberta para a mesa), com o logo para cima.
 */
export function buildAroma(ctx: ModelCtx, p: AromaParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const test = p.print === "test";
    const sc = aromaCase(p);
    const L = caseLayout(sc);
    const closed = screwCaseClosed(ctx, sc);
    const body0 = k(closed.body);
    const lid0 = k(closed.lid);
    const lidTopZ = L.shoulder + L.lidHeight;
    const roofZ = lidTopZ - L.lidTop; // face de baixo do teto da tampa

    // ---- tampa: furos em anel e logo no meio
    let lid = lid0;
    const inner = L.femaleMinor; // raio livre sob o teto
    const room = Math.max(0, inner - (p.holeDiameter + 2 * HOLE_MARGIN)); // raio que sobra para o logo depois de reservar a faixa dos furos
    const logoR = test ? 0 : Math.min(p.logoSize / 2, room);
    const ringR = logoR + (inner - logoR) / 2;
    let logo: CS | null = null;
    if (!test) {
      const src = ctx.art && !ctx.art.isEmpty() ? ctx.art : (() => { const t = ctx.text(p.text, 20); return t && k(t); })();
      if (src && logoR > 2) logo = k(fitInto(src, 2 * logoR, 2 * logoR, 0));
      if (inner - logoR < p.holeDiameter + 2 * HOLE_MARGIN) warnings.push("Os furos não cabem em volta do logo: diminua o logo ou o furo.");
      const dots = holeCenters(p, logo ? ringR : inner * 0.6);
      const cutters = dots.map((c) => k(k(M.Manifold.cylinder(L.lidTop + 2, p.holeDiameter / 2, p.holeDiameter / 2, 24)).translate([c[0], c[1], roofZ - 1])));
      lid = k(lid.subtract(k(M.Manifold.union(cutters))));
    }
    // a tampa sai de pé: a borda aberta na mesa
    const upright = k(lid.translate([0, 0, -L.shoulder]));
    const dx = 2 * L.outer + GAP + (p.keyring && !test ? EAR_REACH : 0);
    const placedLid = k(upright.translate([dx, 0, 0]));
    const lidParts = [{ name: "Tampa", color: p.lidColor, mesh: solidMesh(placedLid) }];
    if (logo) lidParts.push({ name: "Logo", color: p.logoColor, mesh: slab(k(logo.translate([dx, 0])), p.relief, lidTopZ - L.shoulder) });

    // ---- corpo: olhal rente à mesa
    let body = body0;
    if (p.keyring && !test) {
      const ear = k(k(k(roundedRect(M, EAR * 2, EAR, EAR / 2)).subtract(k(k(M.CrossSection.circle(EAR_HOLE / 2, 32)).translate([EAR / 2, 0])))).translate([L.outer - EAR_JOIN + EAR, 0]));
      body = k(body.add(k(ear.extrude(EAR_THICK))));
    }
    if (p.clearance < 0.2) warnings.push("Folga pequena: a tampa pode não rosquear. Imprima o teste da rosca antes.");
    return {
      models: [
        { name: "Corpo", parts: [{ name: "Corpo", color: p.bodyColor, mesh: solidMesh(body) }] },
        { name: "Tampa", parts: lidParts },
      ],
      warnings,
    };
  });
}
