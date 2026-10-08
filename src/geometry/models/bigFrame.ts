import { bedMm } from "../bed";
import { modelsBounds } from "../bounds";
import { layoutOnPlate } from "../keychain";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type FrameProfile = "flat" | "chamfer" | "round";
export type FrameBack = "none" | "hook" | "easel";

export type BigFrameParams = {
  artW: number; // largura da arte (o papel ou a tela)
  artH: number; // altura da arte
  width: number; // largura da moldura vista de frente, da janela até a borda de fora
  depth: number; // espessura da moldura
  profile: FrameProfile;
  claws: boolean; // garras que seguram a arte por trás
  back: FrameBack;
  bodyColor: string;
  cornerColor: string;
};

export const DEFAULT_BIG_FRAME: BigFrameParams = {
  artW: 500,
  artH: 700,
  width: 25,
  depth: 12,
  profile: "chamfer",
  claws: true,
  back: "hook",
  bodyColor: "#1c1c1e",
  cornerColor: "#c9a24a",
};

export const FRAME_LAP = 5; // quanto a moldura cobre a arte em volta
export const FRAME_LIP = 3; // espessura da frente, que segura a arte
const REBATE_PLAY = 0.5; // folga do rebaixo em cada lado da arte
export const TAIL_LEN = 9;
export const TAIL_CLEARANCE = 0.25;
const EDGE = 6; // a peça fica um pouco menor que a mesa
const PROFILE_STEPS = 6;
const PILOT_D = 2.6;
const CLAW_SCREW_FROM_REBATE = 6.5;
const CLAW_BACK = 15; // a garra avança sobre a arte
const CLAW_FRONT = 5;
const CLAW_W = 9;
const CLAW_T = 2.5;
const CLAW_HOLE = 3.4;
const KEY_HEAD = 8;
const KEY_SLOT = 4.2;
const KEY_LEN = 8;
const KEY_SKIN = 2;
const EASEL_W = 18;
const EASEL_T = 3;
const GAP = 8;

const rad = (d: number) => (d * Math.PI) / 180;

type Piece = { name: string; corner: boolean; box: [number, number, number, number]; dir: [number, number]; across: number };
export type Placed = { name: string; corner: boolean; solid: Solid };

/** Medidas da moldura: janela, tamanho de fora e quanto cada lado se divide para caber na mesa. */
export function frameDims(p: BigFrameParams) {
  const winW = p.artW - 2 * FRAME_LAP;
  const winH = p.artH - 2 * FRAME_LAP;
  const outW = winW + 2 * p.width;
  const outH = winH + 2 * p.width;
  const usable = bedMm() - EDGE;
  const split = outW > usable || outH > usable;
  const maxBar = usable - TAIL_LEN - 2;
  const segs = (len: number, odd = false) => {
    if (!split) return 1;
    const n = Math.max(1, Math.ceil(len / maxBar));
    return odd && n % 2 === 0 ? n + 1 : n;
  };
  const band = p.width - FRAME_LAP - REBATE_PLAY;
  const head = Math.min(16, 0.62 * band);
  return { winW, winH, outW, outH, usable, split, nTop: segs(winW, p.back === "easel"), nBottom: segs(winW), nSide: segs(winH), band, head, neck: 0.62 * head };
}

const box = (M: ManifoldToplevel, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Solid => scoped((k) => k(M.Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0]));

const cyl = (M: ManifoldToplevel, r: number, z0: number, z1: number, x = 0, y = 0): Solid => scoped((k) => k(M.Manifold.cylinder(z1 - z0, r, r, 24)).translate([x, y, z0]));

/** Casca de fora: reta, com a quina da frente chanfrada ou arredondada (casco convexo de camadas). */
function outerShell(M: ManifoldToplevel, p: BigFrameParams, outW: number, outH: number): Solid {
  const c = p.profile === "flat" ? 0 : Math.min(p.profile === "chamfer" ? 4 : 6, p.depth - FRAME_LIP - 1);
  const layers: [number, number][] = [[0, 0]];
  if (c > 0) {
    layers.push([p.depth - c, 0]);
    if (p.profile === "chamfer") layers.push([p.depth, c]);
    else for (let i = 1; i <= PROFILE_STEPS; i++) layers.push([p.depth - c + c * Math.sin(rad((90 * i) / PROFILE_STEPS)), c * (1 - Math.cos(rad((90 * i) / PROFILE_STEPS)))]);
  } else layers.push([p.depth, 0]);
  const pts = layers.flatMap(([z, inset]) => [-1, 1].flatMap((sx) => [-1, 1].map((sy): [number, number, number] => [(sx * (outW / 2 - inset)), (sy * (outH / 2 - inset)), z])));
  return M.Manifold.hull(pts);
}

/** Trapézio da cauda de andorinha em coordenadas do mundo: base no plano do corte, cabeça mais larga para dentro da peça de dentro. */
function tailShape(M: ManifoldToplevel, d: ReturnType<typeof frameDims>, at: [number, number], dir: [number, number], grow: number): CS {
  return scoped((k) => {
    const base = k(new M.CrossSection([[[-1, -d.neck / 2], [TAIL_LEN, -d.head / 2], [TAIL_LEN, d.head / 2], [-1, d.neck / 2]]], "NonZero"));
    const shape = grow > 0 ? k(base.offset(grow, "Miter", 4, 8)) : base;
    return k(shape.rotate((Math.atan2(dir[1], dir[0]) * 180) / Math.PI)).translate(at);
  });
}

/** Prisma da forma 2D por toda a espessura (e um pouco mais); dá delete() na forma. */
const prism = (cs: CS, depth: number): Solid => scoped((k) => k(k(cs).extrude(depth + 2)).translate([0, 0, -1]));

/** Onde cada peça está na moldura montada: cantos, e os lados divididos em trechos iguais, na ordem do giro horário. */
function chain(p: BigFrameParams, d: ReturnType<typeof frameDims>): Piece[] {
  const hw = d.winW / 2, hh = d.winH / 2, ow = hw + p.width, oh = hh + p.width;
  const cx = hw + FRAME_LAP + REBATE_PLAY + d.band / 2;
  const cy = hh + FRAME_LAP + REBATE_PLAY + d.band / 2;
  const out: Piece[] = [];
  const side = (n: number, from: number, to: number, mk: (a: number, b: number) => Piece["box"], dir: [number, number], across: number, name: string) => {
    for (let i = 0; i < n; i++) out.push({ name: `${name} ${i + 1}`, corner: false, box: mk(from + ((to - from) * i) / n, from + ((to - from) * (i + 1)) / n), dir, across });
  };
  out.push({ name: "Canto 1", corner: true, box: [-ow, -hw, hh, oh], dir: [1, 0], across: cy });
  side(d.nTop, -hw, hw, (a, b) => [a, b, hh, oh], [1, 0], cy, "Lado de cima");
  out.push({ name: "Canto 2", corner: true, box: [hw, ow, hh, oh], dir: [0, -1], across: cx });
  side(d.nSide, hh, -hh, (a, b) => [hw, ow, b, a], [0, -1], cx, "Lado direito");
  out.push({ name: "Canto 3", corner: true, box: [hw, ow, -oh, -hh], dir: [-1, 0], across: -cy });
  side(d.nBottom, hw, -hw, (a, b) => [b, a, -oh, -hh], [-1, 0], -cy, "Lado de baixo");
  out.push({ name: "Canto 4", corner: true, box: [-ow, -hw, -oh, -hh], dir: [0, 1], across: -cx });
  side(d.nSide, -hh, hh, (a, b) => [-ow, -hw, a, b], [0, 1], -cx, "Lado esquerdo");
  return out;
}

/** Ponto do plano de corte que a peça entrega à seguinte (centro da faixa inteira de cada lado). */
function jointAt(piece: Piece): [number, number] {
  const [x0, x1, y0, y1] = piece.box;
  const [dx, dy] = piece.dir;
  return dx !== 0 ? [dx > 0 ? x1 : x0, piece.across] : [piece.across, dy > 0 ? y1 : y0];
}

/** O anel inteiro da moldura, sem cortes: casca, janela, rebaixo para a arte e furos de fixação. */
function ring(M: ManifoldToplevel, p: BigFrameParams, d: ReturnType<typeof frameDims>): Solid {
  return scoped((k) => {
    const shell = k(outerShell(M, p, d.outW, d.outH));
    const window = k(box(M, -d.winW / 2, d.winW / 2, -d.winH / 2, d.winH / 2, -1, p.depth + 1));
    const aw = (p.artW + 2 * REBATE_PLAY) / 2, ah = (p.artH + 2 * REBATE_PLAY) / 2;
    const rebate = k(box(M, -aw, aw, -ah, ah, -1, p.depth - FRAME_LIP));
    return k(k(shell.subtract(window)).subtract(rebate)).translate([0, 0, 0]);
  });
}

const pilot = (M: ManifoldToplevel, p: BigFrameParams, x: number, y: number): Solid => cyl(M, PILOT_D / 2, -1, Math.min(p.depth - FRAME_LIP, 10), x, y);

/** Cavidade de chaveiro para pendurar num parafuso de parede: entrada redonda, fenda estreita para baixo e bolso para a cabeça. */
function keyhole(M: ManifoldToplevel, p: BigFrameParams, x: number, y: number): Solid {
  return scoped((k) => {
    const top = Math.min(5.5, p.depth - FRAME_LIP + 0.5);
    const parts = [
      cyl(M, KEY_HEAD / 2, -1, KEY_SKIN, x, y),
      box(M, x - KEY_SLOT / 2, x + KEY_SLOT / 2, y - KEY_LEN, y, -1, KEY_SKIN),
      cyl(M, KEY_HEAD / 2, KEY_SKIN - 0.01, top, x, y),
      box(M, x - KEY_HEAD / 2, x + KEY_HEAD / 2, y - KEY_LEN, y, KEY_SKIN - 0.01, top),
    ].map(k);
    return M.Manifold.union(parts);
  });
}

/** Furos de fixação (garras e dobradiça do apoio) e chaveiros: posições nos centros dos trechos, longe dos cortes. */
function fixings(M: ManifoldToplevel, p: BigFrameParams, d: ReturnType<typeof frameDims>, pieces: Piece[]): { holes: Solid[]; claws: number } {
  const holes: Solid[] = [];
  let claws = 0;
  const hw = d.winW / 2, hh = d.winH / 2;
  const screwOff = FRAME_LAP + REBATE_PLAY + CLAW_SCREW_FROM_REBATE;
  const sides = pieces.filter((q) => !q.corner);
  if (p.claws)
    for (const q of sides) {
      const [x0, x1, y0, y1] = q.box;
      const vertical = q.dir[0] === 0;
      const [cx, cy] = vertical ? [q.dir[1] < 0 ? hw + screwOff : -(hw + screwOff), (y0 + y1) / 2] : [(x0 + x1) / 2, q.dir[0] > 0 ? hh + screwOff : -(hh + screwOff)];
      holes.push(pilot(M, p, cx, cy));
      claws++;
    }
  if (p.back === "hook") {
    const top = sides.filter((q) => q.dir[0] > 0);
    const first = top[0];
    const s = first.box[1] - first.box[0];
    const kx = (first.box[0] + first.box[1]) / 2 + 0.25 * s;
    const ky = hh + FRAME_LAP + REBATE_PLAY + d.band / 2 + KEY_LEN / 2;
    holes.push(keyhole(M, p, -kx, ky), keyhole(M, p, kx, ky));
  }
  if (p.back === "easel") holes.push(pilot(M, p, 0, hh + FRAME_LAP + REBATE_PLAY + CLAW_SCREW_FROM_REBATE));
  return { holes, claws };
}

/** Peças como ficam na moldura montada (cada uma com a sua cauda para a próxima); quem chama dá delete() em cada sólido. */
export function framePieces(ctx: ModelCtx, p: BigFrameParams): { pieces: Placed[]; claws: number; ringVolume: number } {
  const { M } = ctx;
  const d = frameDims(p);
  const list = chain(p, d);
  const fix = fixings(M, p, d, list);
  return scoped((k) => {
    const full = k(ring(M, p, d));
    const drilled = fix.holes.length ? k(full.subtract(k(M.Manifold.union(fix.holes)))) : full;
    fix.holes.forEach((h) => h.delete());
    const ringVolume = drilled.volume();
    if (!d.split) {
      const hw = d.winW / 2, hh = d.winH / 2, ow = hw + p.width, oh = hh + p.width;
      const corners = k(M.Manifold.union([[-ow, -hw, hh, oh], [hw, ow, hh, oh], [hw, ow, -oh, -hh], [-ow, -hw, -oh, -hh]].map(([a, b, c, e]) => k(box(M, a, b, c, e, -1, p.depth + 1)))));
      return { pieces: [{ name: "Moldura", corner: false, solid: drilled.subtract(corners) }, { name: "Cantos", corner: true, solid: drilled.intersect(corners) }], claws: fix.claws, ringVolume };
    }
    const bases = list.map((q) => k(drilled.intersect(k(box(M, q.box[0], q.box[1], q.box[2], q.box[3], -1, p.depth + 1)))));
    const pieces = list.map((q, i) => {
      const prev = list[(i + list.length - 1) % list.length];
      const socket = k(prism(tailShape(M, d, jointAt(prev), prev.dir, TAIL_CLEARANCE), p.depth));
      const tail = k(drilled.intersect(k(prism(tailShape(M, d, jointAt(q), q.dir, 0), p.depth))));
      const fitted = k(bases[i].subtract(socket));
      return { name: q.name, corner: q.corner, solid: M.Manifold.union([fitted, tail]) };
    });
    return { pieces, claws: fix.claws, ringVolume };
  });
}

/** Garra: tira com furo para o parafuso, que prende a arte por trás. */
function claw(M: ManifoldToplevel): Solid {
  return scoped((k) => {
    const bar = k(box(M, -CLAW_FRONT, CLAW_BACK, -CLAW_W / 2, CLAW_W / 2, 0, CLAW_T));
    return k(bar.subtract(k(M.Manifold.cylinder(CLAW_T + 2, CLAW_HOLE / 2, CLAW_HOLE / 2, 16)).translate([0, 0, -1]))).translate([0, 0, 0]);
  });
}

/** Perna do apoio traseiro: tira com furo na ponta de cima, presa por um parafuso que serve de dobradiça. */
function easelLeg(M: ManifoldToplevel, length: number): Solid {
  return scoped((k) => {
    const bar = k(box(M, -EASEL_W / 2, EASEL_W / 2, 0, length, 0, EASEL_T));
    return k(bar.subtract(k(M.Manifold.cylinder(EASEL_T + 2, CLAW_HOLE / 2, CLAW_HOLE / 2, 16)).translate([0, 8, -1]))).translate([0, 0, 0]);
  });
}

/**
 * Moldura grande dividida: moldura de pôster ou quadro maior que a mesa, cortada em cantos e trechos de lado que se
 * encaixam por cauda de andorinha (sem cola; deslizam no sentido da espessura). Os cantos saem noutra cor. Janela com
 * rebaixo para a arte, garras de parafuso que a seguram, e apoio de mesa (perna) ou chaveiros para pendurar.
 * Imprime de frente para cima, as peças soltas e arrumadas na mesa.
 */
export function buildBigFrame(ctx: ModelCtx, p: BigFrameParams): ModelOutput {
  const { M } = ctx;
  const d = frameDims(p);
  const warnings: string[] = [];
  const { pieces, claws } = framePieces(ctx, p);
  const colorOf = (corner: boolean) => (corner ? p.cornerColor : p.bodyColor);
  const models: Model[] = d.split ? pieces.map((q) => ({ name: q.name, parts: [{ name: q.corner ? "Canto" : "Lado", color: colorOf(q.corner), mesh: solidMesh(q.solid) }] })) : [{ name: "Moldura", parts: pieces.map((q) => ({ name: q.corner ? "Cantos" : "Moldura", color: colorOf(q.corner), mesh: solidMesh(q.solid) })) }];
  pieces.forEach((q) => q.solid.delete());
  if (claws > 0) {
    const c = claw(M);
    const mesh = solidMesh(c);
    c.delete();
    for (let i = 0; i < claws; i++) models.push({ name: `Garra ${i + 1}`, parts: [{ name: "Garra", color: p.bodyColor, mesh }] });
  }
  if (p.back === "easel") {
    const leg = easelLeg(M, Math.min(0.6 * d.outH, d.usable));
    models.push({ name: "Perna do apoio", parts: [{ name: "Perna", color: p.bodyColor, mesh: solidMesh(leg) }] });
    leg.delete();
  }
  const laid = layoutOnPlate(models, d.usable, GAP);
  const extent = modelsBounds(laid);
  const multi = !!extent && Math.max(extent.max[0] - extent.min[0], extent.max[1] - extent.min[1]) > bedMm();
  if (d.split) warnings.push(`A moldura passa da mesa de ${bedMm()} mm e sai em ${pieces.length} peças que se encaixam por cauda de andorinha (sem cola): deslize cada peça na seguinte no sentido da espessura, na ordem dos números.${multi ? " Tudo junto pede mais de uma mesa de impressão: o fatiador arruma as placas." : ""}`);
  if (p.claws) warnings.push(`Garras: ${claws}, uma por trecho de lado. Prenda cada uma com um parafuso de madeira de 3 mm × 12 mm no furo do verso; a garra segura a arte (e um papelão atrás) no rebaixo.`);
  if (p.back === "hook") warnings.push("Gancho: dois chaveiros no verso de cima. Pendure em parafusos de parede (cabeça de uns 7 mm) e, acima de 600 mm de largura, use também fita de pendurar.");
  if (p.back === "easel") warnings.push("Apoio de mesa: prenda a perna no furo de cima do verso com um parafuso de 3 mm × 16 mm, frouxo, como dobradiça.");
  if (p.profile !== "flat") warnings.push("Imprima de frente para cima, como está: o chanfro ou a curva fica na face de cima e não precisa de suporte.");
  if (p.width < 20) warnings.push("Moldura estreita: a largura mínima para o encaixe e as garras é 20 mm.");
  return { models: laid, warnings };
}
