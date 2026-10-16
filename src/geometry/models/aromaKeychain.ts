import type { CS } from "../manifold";
import { fitInto, followTransform, scoped } from "../shape2d";
import type { Edge } from "./bevel";
import { caseOutlines, type CaseShapeId } from "./caseShapes";
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
  /** Contorno externo; o miolo da rosca é sempre redondo. */
  shape: CaseShapeId;
  /** Estrias na borda da tampa (pegada para girar). */
  knurl: boolean;
  /** Arestas do corpo e da tampa. */
  edge: Edge;
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
  logoSize: 40, // maior que o espaço: ocupa a área dentro do anel de furos
  relief: 0.8,
  shape: "round",
  knurl: true,
  edge: "round",
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
const EAR_JOIN = 5; // quanto o olhal entra na parede do corpo (fora da cavidade)
const EAR_REACH = 2 * EAR - EAR_JOIN; // quanto o olhal passa da parede
const EAR_HOLE = 4;
const EAR_THICK = 3;
const GAP = 10;
const BEVEL = 0.9; // raio/chanfro das arestas (mm)
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

const EAR_BAND = 0.15; // faixa perto da borda que decide onde o olhal encosta (como no abridor)

/** Ponto mais à direita do contorno, no meio da faixa perto da borda (o olhal não fica num bico). */
function rightPoint(outline: CS): [number, number] {
  const pts = outline.toPolygons().flat();
  const b = outline.bounds();
  const near = pts.filter((q) => q[0] >= b.max[0] - EAR_BAND * (b.max[0] - b.min[0])).map((q) => q[1]);
  return [b.max[0], (Math.min(...near) + Math.max(...near)) / 2];
}

/**
 * Chaveiro aromatizador (#219): cápsula de rosca (a do Estojo) com cavidade para o feltro no corpo, tampa com furos de
 * aroma em anel e logo em relevo no meio (1 ou 2 cores), olhal, contorno redondo/coração/gota/hexágono, estrias na tampa e
 * arestas suavizadas. A tampa sai de pé (aberta para a mesa), com o logo para cima; a prévia mostra também o conjunto montado.
 */
export function buildAroma(ctx: ModelCtx, p: AromaParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const test = p.print === "test";
    const sc = aromaCase(p);
    const L = caseLayout(sc);
    const shape = test ? "round" : p.shape;
    const outlines = caseOutlines(M, shape, L.outer, p.knurl && !test);
    const outline = k(outlines.outline), lidOutline = k(outlines.lidOutline);
    const closed = screwCaseClosed(ctx, sc, { outline, lidOutline, edge: p.edge, bevel: BEVEL });
    const lidTopZ = L.shoulder + L.lidHeight;
    const roofZ = lidTopZ - L.lidTop; // face de baixo do teto da tampa

    // ---- tampa: furos em anel e logo no meio
    let lid = k(closed.lid);
    const inner = L.femaleMinor; // raio livre sob o teto
    const room = Math.max(0, inner - (p.holeDiameter + 2 * HOLE_MARGIN)); // raio que sobra para o logo depois de reservar a faixa dos furos
    const logoR = test ? 0 : Math.min(p.logoSize / 2, room);
    const ringR = logoR + (inner - logoR) / 2;
    let logo: CS | null = null;
    let layers: { color: string; cs: CS }[] | null = null;
    if (!test) {
      const art = ctx.art && !ctx.art.isEmpty() ? ctx.art : null;
      const src = art ?? (() => { const t = ctx.text(p.text, 20); return t && k(t); })();
      if (src && logoR > 2) logo = k(fitInto(src, 2 * logoR, 2 * logoR, 0));
      // arte de 2+ cores: uma parte por cor, como no Chaveiro de logo
      if (logo && art && ctx.artLayers && ctx.artLayers.length > 1) {
        const lg = logo;
        layers = ctx.artLayers.map((l) => ({ color: l.color, cs: k(k(followTransform(art, lg, l.cs)).intersect(lg)) })).filter((l) => !l.cs.isEmpty());
      }
      if (inner - logoR < p.holeDiameter + 2 * HOLE_MARGIN) warnings.push("Os furos não cabem em volta do logo: diminua o logo ou o furo.");
      const dots = holeCenters(p, logo ? ringR : inner * 0.6);
      const cutters = dots.map((c) => k(k(M.Manifold.cylinder(L.lidTop + 2, p.holeDiameter / 2, p.holeDiameter / 2, 24)).translate([c[0], c[1], roofZ - 1])));
      lid = k(lid.subtract(k(M.Manifold.union(cutters))));
    }

    // ---- corpo: olhal rente à mesa, no lado direito do contorno
    let body = k(closed.body);
    let earRight = outline.bounds().max[0];
    if (p.keyring && !test) {
      const [ex, ey] = rightPoint(outline);
      const cx = ex - EAR_JOIN + EAR;
      const ear = k(k(k(roundedRect(M, EAR * 2, EAR, EAR / 2)).subtract(k(k(M.CrossSection.circle(EAR_HOLE / 2, 32)).translate([EAR / 2, 0])))).translate([cx, ey]));
      body = k(body.add(k(ear.extrude(EAR_THICK))));
      earRight = ex + EAR_REACH;
    }
    const logoParts = (dx: number, dy: number, z: number) => {
      if (!logo) return [];
      const at = (cs: CS) => k(cs.translate([dx, dy]));
      if (layers) return layers.map((l, i) => ({ name: `Logo ${i + 1}`, color: l.color, mesh: slab(at(l.cs), p.relief, z) }));
      return [{ name: "Logo", color: p.logoColor, mesh: slab(at(logo), p.relief, z) }];
    };

    // ---- na mesa: a tampa de pé (a borda aberta na mesa) ao lado do corpo
    const upright = k(lid.translate([0, 0, -L.shoulder]));
    const dx = earRight + GAP - lidOutline.bounds().min[0];
    const placedLid = k(upright.translate([dx, 0, 0]));
    const models = [
      { name: "Corpo", parts: [{ name: "Corpo", color: p.bodyColor, mesh: solidMesh(body) }] },
      { name: "Tampa", parts: [{ name: "Tampa", color: p.lidColor, mesh: solidMesh(placedLid) }, ...logoParts(dx, 0, lidTopZ - L.shoulder)] },
    ];
    // ---- montado: a tampa rosqueada no corpo, só para ver (não vai para o arquivo nem para a conta da mesa; a prévia alterna entre ele e a mesa)
    if (!test) {
      const asm = (s: typeof body) => solidMesh(s);
      models.push({
        name: "Montado",
        previewOnly: true,
        parts: [{ name: "Corpo", color: p.bodyColor, mesh: asm(body) }, { name: "Tampa", color: p.lidColor, mesh: asm(lid) }, ...logoParts(0, 0, lidTopZ)],
      } as (typeof models)[number]);
    }
    if (p.clearance < 0.2) warnings.push("Folga pequena: a tampa pode não rosquear. Imprima o teste da rosca antes.");
    return { models, warnings };
  });
}
