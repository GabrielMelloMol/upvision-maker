import { nozzleMm } from "./bed";
import type { CS, ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import type { Model } from "./types";

type K = <D extends { delete(): void }>(o: D) => D;

export type StampShape = "rect" | "round";
export type StampAlign = "pins" | "magnets" | "hinge";

/** Perfis de papel: a folga é a espessura que o papel ocupa entre as placas (e a folga lateral da cavidade). */
export const PAPER_PROFILES = [
  { id: "common", label: "Papel comum", paper: 0.5 },
  { id: "card300", label: "Cartão 300 g", paper: 0.6 },
  { id: "thick", label: "Papel grosso", paper: 1 },
] as const;

export type StampParams = {
  shape: StampShape;
  /** Área carimbada: largura (diâmetro se redondo) e altura, em mm. */
  w: number;
  h: number;
  /** Faixa de placa em volta da área, onde ficam pinos e ímãs. */
  edge: number;
  /** Espessura das placas. */
  plate: number;
  /** Altura do relevo. */
  relief: number;
  /** Inclinação das paredes do relevo (graus): solta o papel sem rasgar. */
  draft: number;
  paper: number;
  align: StampAlign;
  pinFit: number;
  magD: number;
  magH: number;
  magTol: number;
  magCount: 2 | 4;
  hingeGap: number;
  hingeFilm: number;
  topColor: string;
  bottomColor: string;
};

export const DEFAULT_STAMP: StampParams = {
  shape: "rect",
  w: 50,
  h: 30,
  edge: 9,
  plate: 4,
  relief: 1.2,
  draft: 10,
  paper: 0.5,
  align: "pins",
  pinFit: 0.2,
  magD: 6,
  magH: 2,
  magTol: 0.15,
  magCount: 2,
  hingeGap: 8,
  hingeFilm: 0.4,
  topColor: "#f97316",
  bottomColor: "#2563eb",
};

const PAPER_COLOR = "#f5f1e8";
const PIN_R = 2.2;
const PIN_TIP_R = 1.1;
const CORNER_R = 2;
const CIRCLE_SEGS = 96;
const PIN_SEGS = 32;
const MIN_FLOOR = 1.2; // chão da cavidade (e do relevo) para a placa não furar
const MAGNET_CEILING = 0.8; // parede entre o ímã e a face que encosta no papel
const BED_GAP = 8;
const FILM_OVERLAP = 1.5;
const PREVIEW_GAP = 12;
const MIN_SLICE = 0.2;
const MAX_SLICES = 12;
const NO_ART = "O desenho está vazio: não há o que gravar.";

/** Faixa mínima de placa para o alinhamento escolhido caber com folga. */
export function minEdge(p: StampParams): number {
  if (p.align === "magnets") return p.magD + p.magTol + 2.4;
  return 2 * (PIN_R + p.pinFit + 1.2);
}

/** Espessura da placa: a pedida, ou a mínima para o relevo e os ímãs caberem. */
export function plateThickness(p: StampParams): number {
  const magnets = p.align === "magnets" ? p.magH + 0.1 + MAGNET_CEILING : 0;
  return Math.max(p.plate, p.relief + MIN_FLOOR, magnets);
}

/** Raio do pino (cone) na altura z acima da face da placa. */
const pinRadius = (z: number, pinH: number) => PIN_R + ((PIN_TIP_R - PIN_R) * Math.min(z, pinH)) / pinH;
const pinHeight = (p: StampParams) => p.relief + p.paper + 2.5;

/** Pontos de alinhamento (pinos ou ímãs) no referencial da placa do relevo, centro em (0,0). */
export function alignPoints(p: StampParams, edge: number): [number, number][] {
  const a = p.w / 2 + edge / 2;
  const b = (p.shape === "round" ? p.w : p.h) / 2 + edge / 2;
  if (p.align === "hinge") {
    // junto à dobradiça (lado esquerdo da placa do relevo): o papel sai livre pelos outros lados
    return [[-a, b], [-a, -b]];
  }
  if (p.shape === "round") {
    const r = p.w / 2 + edge / 2;
    const c = r * Math.SQRT1_2;
    const diag: [number, number][] = [[c, c], [-c, -c]];
    return p.align === "magnets" && p.magCount === 4 ? [...diag, [-c, c], [c, -c]] : diag;
  }
  const diag: [number, number][] = [[a, b], [-a, -b]];
  return p.align === "magnets" && p.magCount === 4 ? [...diag, [-a, b], [a, -b]] : diag;
}

const plateOutline = (M: ManifoldToplevel, p: StampParams, edge: number, k: K): CS => {
  if (p.shape === "round") return k(M.CrossSection.circle(p.w / 2 + edge, CIRCLE_SEGS));
  const W = p.w + 2 * edge, H = p.h + 2 * edge;
  return k(k(M.CrossSection.square([W - 2 * CORNER_R, H - 2 * CORNER_R], true)).offset(CORNER_R, "Round"));
};

/** O desenho na altura z do relevo: levemente mais largo na base (inclinação das paredes). */
const profileAt = (art: CS, z: number, relief: number, draft: number, k: K): CS => {
  const grow = Math.max(0, relief - z) * Math.tan((draft * Math.PI) / 180);
  return grow > 1e-6 ? k(art.offset(grow, "Round")) : art;
};

/** Degraus de 0,2 mm: cada degrau é mais estreito que o de baixo, então imprime sem suporte. */
const sliceCount = (relief: number) => Math.min(MAX_SLICES, Math.max(1, Math.ceil(relief / MIN_SLICE)));

function reliefSolid(M: ManifoldToplevel, art: CS, p: StampParams, k: K): Solid {
  const n = sliceCount(p.relief);
  const dz = p.relief / n;
  const parts = Array.from({ length: n }, (_, i) => {
    const prof = profileAt(art, i * dz, p.relief, p.draft, k);
    // o 1º degrau entra 0,01 mm na placa e os outros 0,001 mm no de baixo: sem faces coladas
    const z0 = i === 0 ? -0.01 : i * dz;
    return k(k(prof.extrude(i * dz + dz - z0 + (i === n - 1 ? 0 : 0.001))).translate([0, 0, z0]));
  });
  return k(M.Manifold.union(parts));
}

/**
 * Cavidade da placa de baixo (de cima para baixo, profundidade d = 0 na face): onde o relevo estiver a esta
 * profundidade (altura d + papel), mais a folga do papel em volta. Cada degrau usa o degrau mais largo do relevo
 * que passa por ali, então o relevo nunca encosta na parede.
 */
function cavitySolid(M: ManifoldToplevel, art: CS, p: StampParams, T: number, k: K): Solid {
  const n = sliceCount(p.relief);
  const dz = p.relief / n;
  const slices = Array.from({ length: n }, (_, i) => {
    const zRelief = Math.min(Math.floor((i * dz + p.paper) / dz + 1e-9) * dz, p.relief);
    const prof = profileAt(art, zRelief, p.relief, p.draft, k);
    // vãos entre traços menores que o bico deixariam paredes finas demais na placa: a cavidade os fecha
    const nz = nozzleMm();
    const plain = k(prof.offset(p.paper, "Round"));
    const closed = k(k(prof.offset(p.paper + nz / 2, "Round")).offset(-nz / 2, "Round"));
    const wide = k(plain.add(closed)); // a união garante que o fechamento só acrescenta (arcos em polígonos comem frações de µm)
    const top = T - i * dz; // face em T
    return k(k(wide.extrude(dz + (i === 0 ? 0.05 : 0.001))).translate([0, 0, top - dz]));
  });
  // a face sobe 0,05 para o corte sair limpo
  return k(M.Manifold.union(slices));
}

function pinSolid(M: ManifoldToplevel, p: StampParams, T: number, k: K): Solid {
  const hp = pinHeight(p);
  return k(M.Manifold.cylinder(hp + 0.2, PIN_R, PIN_TIP_R, PIN_SEGS).translate([0, 0, T - 0.2]));
}

/** Furo do pino na placa de baixo (de cima para baixo, entrando pela face): o cone do pino, com a folga, e reto até o fundo. */
function pinHoleSolid(M: ManifoldToplevel, p: StampParams, T: number, k: K): Solid {
  const hp = pinHeight(p);
  const top = pinRadius(p.paper, hp) + p.pinFit;
  const bottom = Math.max(PIN_TIP_R, pinRadius(p.paper + T, hp)) + p.pinFit;
  return k(M.Manifold.cylinder(T + 0.1, bottom, top, PIN_SEGS).translate([0, 0, -0.05]));
}

const magnetPocket = (M: ManifoldToplevel, p: StampParams, k: K): Solid =>
  k(M.Manifold.cylinder(p.magH + 0.1, (p.magD + p.magTol) / 2, (p.magD + p.magTol) / 2, PIN_SEGS).translate([0, 0, -0.05]));

type Plates = {
  top: Solid;
  bottom: Solid;
  /** Só na dobradiça: o filme que une as duas placas. */
  film: Solid | null;
  /** Espessura efetiva das placas e distância do centro de cada placa ao eixo de dobra (x = 0). */
  T: number;
  cx: number;
  edge: number;
};

/** As placas já lado a lado na mesa: a do relevo em +x, a da cavidade em −x (a espelhada, como uma página de livro). */
export function stampPlates(M: ManifoldToplevel, art: CS, p: StampParams, k: K): Plates {
  const edge = Math.max(p.edge, minEdge(p));
  const T = plateThickness(p);
  const outline = plateOutline(M, p, edge, k);
  const pts = alignPoints(p, edge);
  const flat = (cs: CS) => k(cs.extrude(T));
  const gap = p.align === "hinge" ? p.hingeGap : BED_GAP;
  const cx = gap / 2 + outline.bounds().max[0];

  // placa do relevo
  let top = flat(outline);
  top = k(top.add(k(reliefSolid(M, art, p, k).translate([0, 0, T]))));
  if (p.align === "magnets") {
    const pocket = magnetPocket(M, p, k);
    top = k(top.subtract(k(M.Manifold.union(pts.map((q) => k(pocket.translate([q[0], q[1], 0])))))));
  } else {
    const pin = pinSolid(M, p, T, k);
    top = k(top.add(k(M.Manifold.union(pts.map((q) => k(pin.translate([q[0], q[1], 0])))))));
  }

  // placa da cavidade: o relevo espelhado, mais a folga do papel
  const artMirror = k(art.mirror([1, 0]));
  let bottom = flat(plateOutline(M, p, edge, k));
  bottom = k(bottom.subtract(cavitySolid(M, artMirror, p, T, k)));
  if (p.align === "magnets") {
    const pocket = magnetPocket(M, p, k);
    bottom = k(bottom.subtract(k(M.Manifold.union(pts.map((q) => k(pocket.translate([-q[0], q[1], 0])))))));
  } else {
    const hole = pinHoleSolid(M, p, T, k);
    bottom = k(bottom.subtract(k(M.Manifold.union(pts.map((q) => k(hole.translate([-q[0], q[1], 0])))))));
  }

  top = k(top.translate([cx, 0, 0]));
  bottom = k(bottom.translate([-cx, 0, 0]));

  let film: Solid | null = null;
  if (p.align === "hinge") {
    const H = (p.shape === "round" ? p.w : p.h) + 2 * edge - 2 * CORNER_R;
    const span = 2 * (gap / 2 + FILM_OVERLAP);
    const slab = k(M.Manifold.cube([span, H, p.hingeFilm], true).translate([0, 0, p.hingeFilm / 2]));
    // as placas perdem a faixa onde o filme entra: ele ocupa o lugar, sem volumes sobrepostos
    top = k(top.subtract(slab));
    bottom = k(bottom.subtract(slab));
    film = slab;
  }
  return { top, bottom, film, T, cx, edge };
}

/** Papel gravado (só prévia): folha com o desenho em relevo por cima e a cavidade por baixo. */
function paperPreview(M: ManifoldToplevel, art: CS, p: StampParams, edge: number, k: K): Solid {
  const t = p.paper;
  const sheet = k(M.Manifold.cube([p.w + edge, (p.shape === "round" ? p.w : p.h) + edge, t], true).translate([0, 0, t / 2]));
  const bump = k(art.extrude(p.relief + t));
  const inner = k(art.offset(-t, "Round"));
  const dent = inner.isEmpty() ? null : k(inner.extrude(p.relief));
  const raised = dent ? k(bump.subtract(dent)) : bump;
  return k(sheet.add(raised));
}

export type StampOut = { models: Model[]; warnings: string[] };

/**
 * Carimbo seco em relevo: duas placas que se fecham sobre o papel. A de cima tem o desenho em alto-relevo; a de baixo
 * tem o mesmo desenho espelhado em cavidade, com a folga do papel. `art` é o desenho já no lugar (mm, Y para cima,
 * centro na origem, como se lê no papel): o espelho e o deslocamento são sempre calculados aqui, juntos.
 */
export function buildStamp(M: ManifoldToplevel, art: CS, p: StampParams): StampOut {
  return scoped((k) => {
    if (art.isEmpty() || art.area() <= 0) throw new Error(NO_ART);
    const warnings: string[] = [];
    const T = plateThickness(p);
    if (T > p.plate + 1e-9) warnings.push(`Aumentei a placa para ${T.toFixed(1).replace(".", ",")} mm: o relevo e o alinhamento precisam dessa espessura.`);
    const { top, bottom, film, edge } = stampPlates(M, art, p, k);
    if (edge > p.edge + 1e-9) warnings.push(`Aumentei a borda das placas para ${edge.toFixed(1).replace(".", ",")} mm para os ${p.align === "magnets" ? "ímãs" : "pinos"} caberem.`);

    const name = { top: "Placa com relevo", bottom: "Placa com cavidade" };
    const models: Model[] = [];
    if (film) {
      const parts = [
        { name: name.top, color: p.topColor, mesh: toMesh(top) },
        { name: name.bottom, color: p.bottomColor, mesh: toMesh(bottom) },
        { name: "Dobradiça", color: p.topColor, mesh: toMesh(film) },
      ];
      models.push({ name: "Carimbo com dobradiça", parts });
    } else {
      models.push({ name: name.top, parts: [{ name: name.top, color: p.topColor, mesh: toMesh(top) }] });
      models.push({ name: name.bottom, parts: [{ name: name.bottom, color: p.bottomColor, mesh: toMesh(bottom) }] });
    }
    const paper = paperPreview(M, art, p, edge, k);
    const pb = top.boundingBox();
    const dy = (pb.max[1] - pb.min[1]) / 2 + PREVIEW_GAP + (p.shape === "round" ? p.w : p.h) / 2;
    const placed = k(paper.translate([0, dy, 0]));
    models.push({ name: "Papel gravado (prévia)", parts: [{ name: "Papel gravado", color: PAPER_COLOR, mesh: toMesh(placed) }], previewOnly: true });
    return { models, warnings };
  });
}
