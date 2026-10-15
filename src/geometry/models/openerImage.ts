import type { CS } from "../manifold";
import { fitInto, followTransform, scoped } from "../shape2d";
import { backing, offsetOf, requireArt, roundedRect, slab, solidMesh, union, type ElementBox, type ModelCtx, type ModelOutput } from "./common";

export type OpenerSide = "bottom" | "left" | "right" | "top";

export type OpenerImageParams = {
  kind: "bottle" | "can";
  /** Maior lado da imagem, em cm (a peça pronta é maior: ganha a aba do abridor e a argola). */
  sizeCm: number;
  /** Base além do contorno da imagem. */
  margin: number;
  thickness: number;
  relief: number;
  openerSide: OpenerSide;
  ringSide: OpenerSide;
  /** Quanto o abridor entra no desenho (mm): 0 deixa o desenho inteiro e a aba toda para fora; mais deixa a peça mais curta, cortando a ponta do desenho. */
  overlap: number;
  /** Fio levantado em volta da peça, na cor da borda. */
  rim: boolean;
  baseColor: string;
  artColor: string;
  rimColor: string;
};

export const DEFAULT_OPENER_IMAGE: OpenerImageParams = {
  kind: "bottle",
  sizeCm: 6,
  margin: 2.5,
  thickness: 5,
  relief: 0.8,
  openerSide: "bottom",
  ringSide: "top",
  overlap: 0,
  rim: true,
  baseColor: "#ffffff",
  artColor: "#1c1c1e",
  rimColor: "#1c1c1e",
};

type Dir = readonly [number, number];
const DIR: Record<OpenerSide, Dir> = { bottom: [0, -1], top: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE: Record<OpenerSide, OpenerSide> = { bottom: "top", top: "bottom", left: "right", right: "left" };

// peça local do abridor: origem no ponto da borda da imagem, +x para fora
const JOIN = 4; // quanto da aba entra na base (mm)
const JOIN_AREA = 120; // área mínima (mm²) da aba sobre a base: sem isso a aba ficaria presa por uma ponta fina
const MAX_SLIDE = 30; // até onde a aba entra na imagem para achar chão firme (pontas de coração, orelhas)
const WALL_IN = 4; // material entre a base e a abertura
const WALL_SIDE = 4;
const WALL_OUT = 6; // o "dente": material do outro lado da abertura, que faz a força
const CAP_R = 13; // a tampinha tem ~32 mm; a abertura pega a borda dela
const LIP = 5; // parte reta do furo
const TAB_RADIUS = 6;
const CAN_SLOT = [6, 17] as const; // abertura para enganchar o anel da lata (x, y)
const CAN_END = 22;
const CAN_TIP = 2.2; // espessura da ponta da rampa
const CAN_RAMP = 18;
const RING_OUT = 6;
const RING_HOLE = 2.2;
const RING_JOIN = 2.5;
const RING_JOIN_AREA = 25; // mm² do disco da argola sobre a base
const CLOSE = 2.5; // raio dos cantos de dentro da silhueta
const RIM_W = 1.2;
const ART_GAP = 1; // folga entre o relevo e a abertura
const MIN_WALL = 3; // abaixo disso a parede em volta da abertura é fraca
const WALLS = [6, 5, 4, 3, 2, 1.5, 1];
const SLIVER = 0.5; // mm²
const MIN_PIECE = 1; // mm²: menos que isso é farelo do arredondamento, não uma peça
const NEAR_FRAC = 0.15; // faixa perto da borda (fração da altura) que decide o meio da aba

const angleOf = (u: Dir) => (Math.atan2(u[1], u[0]) * 180) / Math.PI;
const br = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Onde a aba encosta no lado `u` de `body`: a borda mais para fora, no meio da largura do trecho que fica perto dela (os dois
 * pés de um bicho, os dois lóbulos de um coração, as duas orelhas), e não numa ponta só.
 */
export function supportPoint(body: CS, u: Dir): [number, number] {
  const b = body.bounds();
  const v = [-u[1], u[0]];
  const along = (q: number[]) => q[0] * u[0] + q[1] * u[1];
  const across = (q: number[]) => q[0] * v[0] + q[1] * v[1];
  const alongSize = Math.abs(u[0]) * (b.max[0] - b.min[0]) + Math.abs(u[1]) * (b.max[1] - b.min[1]);
  const pts = body.toPolygons().flat();
  const far = along(pts.reduce((a, q) => (along(q) > along(a) ? q : a)));
  const near = pts.filter((q) => along(q) >= far - NEAR_FRAC * alongSize).map(across);
  const mid = (Math.min(...near) + Math.max(...near)) / 2;
  return [u[0] * far + v[0] * mid, u[1] * far + v[1] * mid];
}

/** Maior parede (mm) que sobra em volta de `hole` dentro de `outer`; 0 se for menos de 1 mm. */
function wallAround(k: <D extends { delete(): void }>(o: D) => D, outer: CS, hole: CS): number {
  for (const w of WALLS) if (k(hole.subtract(k(outer.offset(-w, "Round")))).area() < SLIVER) return w;
  return 0;
}

/** Quanto (mm) a peça precisa entrar em `body` para sobrepor pelo menos `minArea` mm² (ponta de coração, entalhe entre orelhas). */
function slideIn(k: <D extends { delete(): void }>(o: D) => D, shape: (depth: number) => CS, body: CS, minArea: number): number {
  let d = 0;
  while (d < MAX_SLIDE && k(shape(d).intersect(body)).area() < minArea) d++;
  return d;
}

/**
 * Chaveiro abridor pela imagem: a base segue o contorno da imagem (com margem), o desenho fica em relevo e o abridor
 * (garrafa: abertura com dente reto; lata: fenda e ponta em rampa) vira uma aba num dos 4 lados, com a argola em outro.
 * A aba entra na imagem só o necessário para ficar bem presa; o relevo sai de cima da abertura.
 */
export function buildOpenerImage(ctx: ModelCtx, p: OpenerImageParams): ModelOutput {
  const { M } = ctx;
  const art = requireArt(ctx.art);
  return scoped((k) => {
    const warnings: string[] = [];
    const bottle = p.kind === "bottle";
    const placed = k(fitInto(art, p.sizeCm * 10, p.sizeCm * 10, 0));
    const body = k(backing(M, placed, p.margin));
    const ringSide = p.ringSide === p.openerSide ? OPPOSITE[p.openerSide] : p.ringSide;
    if (ringSide !== p.ringSide) warnings.push("A argola e o abridor estavam no mesmo lado: a argola foi para o lado oposto.");

    // ---- peças do abridor, no sistema local (+x para fora)
    const holeCx = WALL_IN + CAP_R;
    const flatX = holeCx + CAP_R - LIP;
    const tabHalf = bottle ? CAP_R + WALL_SIDE : CAN_SLOT[1] / 2 + WALL_SIDE;
    const outEnd = bottle ? flatX + WALL_OUT : CAN_END;
    const tabLocal = k(k(roundedRect(M, outEnd + JOIN, 2 * tabHalf, TAB_RADIUS)).translate([(outEnd - JOIN) / 2, 0]));
    const holeLocal = bottle
      ? k(k(M.CrossSection.circle(CAP_R, 64).translate([holeCx, 0])).intersect(k(k(M.CrossSection.square([flatX - WALL_IN, 2 * CAP_R], true)).translate([(flatX + WALL_IN) / 2, 0]))))
      : k(k(roundedRect(M, CAN_SLOT[0], CAN_SLOT[1], 2)).translate([CAN_END - 9, 0]));
    // por onde o relevo não passa: em volta da abertura (garrafa) ou sobre a rampa (lata)
    const keepOut = bottle ? k(holeLocal.offset(ART_GAP, "Round")) : k(k(M.CrossSection.square([CAN_RAMP + 1, 2 * tabHalf], true)).translate([CAN_END - CAN_RAMP / 2 + 0.5, 0]));

    // ---- a aba entra na imagem até ter chão firme
    const u = DIR[p.openerSide];
    const P = supportPoint(body, u);
    const at = (d: number): [number, number] => [P[0] - u[0] * d, P[1] - u[1] * d];
    const put = (cs: CS, pos: [number, number]) => k(k(cs.rotate(angleOf(u))).translate(pos));
    const slide = slideIn(k, (d) => put(tabLocal, at(d)), body, JOIN_AREA);
    const [ox, oy] = offsetOf(ctx, "opener");
    const base0 = at(slide + p.overlap);
    const pos: [number, number] = [base0[0] + ox, base0[1] + oy];
    const tab = put(tabLocal, pos);
    const hole = put(holeLocal, pos);
    const noArt = put(keepOut, pos);

    // ---- argola
    const ur = DIR[ringSide];
    const Pr = supportPoint(body, ur);
    const [rx, ry] = offsetOf(ctx, "ring");
    const reach = RING_OUT - RING_JOIN;
    const ringAt = (d: number): [number, number] => [Pr[0] + ur[0] * (reach - d), Pr[1] + ur[1] * (reach - d)];
    const ringSlide = slideIn(k, (d) => k(M.CrossSection.circle(RING_OUT, 48).translate(ringAt(d))), body, RING_JOIN_AREA);
    const rc: [number, number] = [ringAt(ringSlide)[0] + rx, ringAt(ringSlide)[1] + ry];
    const disc = k(M.CrossSection.circle(RING_OUT, 48).translate(rc));
    const ringHole = k(M.CrossSection.circle(RING_HOLE, 32).translate(rc));
    if (k(disc.intersect(body)).isEmpty() && k(disc.intersect(tab)).isEmpty()) warnings.push("A argola ficou solta da peça: arraste-a para perto da borda.");

    // ---- peça inteira
    // cantos de dentro (onde a aba e a argola encontram a imagem) arredondados; farelo do arredondamento (pontos sem área) sai
    const rounded = k(k(k(union(M, [body, tab, disc])).offset(CLOSE, "Round")).offset(-CLOSE, "Round"));
    const pieces = rounded.decompose().map(k).filter((c) => c.area() >= MIN_PIECE);
    if (pieces.length > 1) warnings.push("O abridor ou a argola ficou separado da peça: aproxime-o da imagem.");
    const outer = pieces.length === 1 ? pieces[0] : k(union(M, pieces));
    const flat = k(k(outer.subtract(hole)).subtract(ringHole));
    let base = k(flat.extrude(p.thickness));
    if (!bottle) {
      const x0 = CAN_END - CAN_RAMP;
      const long = 2 * tabHalf + 2;
      const wedge = k(k(k(new M.CrossSection([[[x0, p.thickness + 1], [CAN_END + 1, p.thickness + 1], [CAN_END + 1, CAN_TIP]]], "NonZero").extrude(long)).rotate([90, 0, 0])).translate([0, long / 2, 0]));
      base = k(base.subtract(k(k(wedge.rotate([0, 0, angleOf(u)])).translate([pos[0], pos[1], 0]))));
    }
    const parts = [{ name: "Base", color: p.baseColor, mesh: solidMesh(base) }];

    // ---- relevo (cores da imagem, se tiver) e borda
    const clear = k(union(M, [noArt, k(ringHole.offset(ART_GAP, "Round"))]));
    const artCut = k(placed.subtract(clear));
    const layers = ctx.artLayers && ctx.artLayers.length > 1 ? ctx.artLayers.map((l) => ({ color: l.color, cs: k(k(followTransform(art, placed, l.cs)).intersect(artCut)) })).filter((l) => !l.cs.isEmpty()) : null;
    if (layers) layers.forEach((l, i) => parts.push({ name: `Relevo ${i + 1}`, color: l.color, mesh: slab(l.cs, p.relief, p.thickness) }));
    else if (!artCut.isEmpty()) parts.push({ name: "Relevo", color: p.artColor, mesh: slab(artCut, p.relief, p.thickness) });
    if (p.rim) {
      const band = k(outer.subtract(k(outer.offset(-RIM_W, "Round"))));
      const rim = k(k(band.intersect(flat)).subtract(bottle ? placed : k(union(M, [placed, noArt]))));
      if (!rim.isEmpty()) parts.push({ name: "Borda", color: p.rimColor, mesh: slab(rim, p.relief, p.thickness) });
    }

    // ---- força: parede em volta da abertura e espessura
    const wall = wallAround(k, outer, hole);
    if (wall < MIN_WALL) warnings.push(`A parede em volta da abertura tem só ${wall ? `${br(wall)} mm` : "menos de 1 mm"}: afaste o abridor da borda (mínimo de ${MIN_WALL} mm).`);
    if (bottle && p.thickness < 5) warnings.push("Abridor de garrafa faz força: use espessura de 5 mm ou mais.");

    const box = (c: CS): [number, number, number, number] => {
      const b = c.bounds();
      return [b.min[0], b.min[1], b.max[0], b.max[1]];
    };
    const elements: ElementBox[] = [
      { id: "opener", label: "Abridor", box: box(tab) },
      { id: "ring", label: "Argola", box: box(disc) },
    ];
    return { models: [{ name: bottle ? "Abridor de garrafa" : "Abridor de lata", parts }], warnings, elements };
  });
}
