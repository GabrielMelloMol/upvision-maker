import { nozzleMm } from "../bed";
import type { CS, ManifoldToplevel } from "../manifold";
import { toMesh } from "../mesh";
import { fitInto } from "../shape2d";
import { fixThinStrokes } from "../stampArt";
import type { Part } from "../types";
import { connectIslands, laceRoles, type LaceDensity, type LacePattern, type LaceRoles } from "./lace";
import { butterfly, type K, type Pt } from "./motifs";

export type FlapShape = "triangle" | "round";
export type Hinge = "tulle" | "thin";
type RegionId = "body" | "top" | "bottom" | "left" | "right";

export type EnvelopeParams = {
  /** Corpo do envelope (a frente fechada), em mm. */
  w: number;
  h: number;
  flap: FlapShape;
  /** Quanto cada aba avança sobre o corpo, em % da meia-medida (100 = as pontas se encontram no centro). */
  flapDepth: number;
  frame: number;
  /** Vão entre o corpo e cada aba (a dobra). */
  gap: number;
  hinge: Hinge;
  pattern: LacePattern;
  /** Quanto do tule a renda cobre. */
  density: LaceDensity;
  seed: number;
  /** Com tule: pausa na camada certa; sem: renda mais grossa e tudo ligado à moldura. */
  tulle: boolean;
  /** Espessura da renda com tule e sem tule. */
  thickness: number;
  thicknessNoTulle: number;
  /** Altura em que o tule entra (mm), com tule. */
  tuleAt: number;
  layer: number;
  /** 2 ou 3 tons: com 2, as flores levam o tom das folhas. */
  tones: 2 | 3;
  /** Borboleta de asas soltas na aba de cima (só com tule): as asas ficam planas sobre o tule, para levantar. */
  wings: boolean;
  wingSpan: number;
};

export const DEFAULT_ENVELOPE: EnvelopeParams = {
  w: 120, h: 90, flap: "triangle", flapDepth: 100, frame: 3, gap: 1.6, hinge: "thin", pattern: "floral", density: "medium", seed: 7, tulle: true,
  thickness: 1.2, thicknessNoTulle: 1.6, tuleAt: 0.6, layer: 0.2, tones: 3, wings: false, wingSpan: 34,
};

/** Nomes das partes: a cor de cada uma vem da paleta. */
type Role = "Moldura" | "Folhas" | "Flores";
export type EnvelopeColors = { frame: string; leaf: string; flower: string };

export type FlapPose = { id: RegionId; /** direção da dobra: da dobradiça para fora da aba */ out: Pt; /** ponto da dobradiça no corpo */ hinge: Pt };

type EnvelopeRegion = { id: RegionId; parts: Part[] };

export type EnvelopeOut = {
  /** Todas as regiões no mesmo plano (a mesa), uma parte por tom. */
  parts: Part[];
  /** Cada região separada, para dobrar na prévia. */
  regions: EnvelopeRegion[];
  poses: FlapPose[];
  /** Altura total da renda. */
  height: number;
  /** Altura em que o tule entra, e o Z da pausa (topo da camada antes da qual a impressora para). */
  tuleZ: number | null;
  pauseZ: number | null;
  /** Largura e altura do conjunto aberto (cruz). */
  spread: { w: number; h: number };
  warnings: string[];
  loose: number;
  bridged: number;
  /** Altura da dobradiça fina (só nas camadas de baixo). */
  hingeT: number;
};

const MIN_WIRE = 0.5;
const HINGE_T = 0.4;
const HINGE_OVERLAP = 1.2;
const HINGE_MERGE = 0.05; // a tira entra 0,05 mm na moldura: encostar só pela face deixaria a dobradiça como peça separada para o fatiador
const MIN_ISLAND_NOZZLES = 6; // pedaço solto menor que isto (em bicos quadrados) é pó e sai

type RegionShape = { id: RegionId; outline: CS; w: number; h: number; cx: number; cy: number; rot: number; ox: number; oy: number; out: Pt; hinge: Pt };

/** Aba em coordenadas próprias: base na reta y = 0 (largura `base`), ponta para +y a `depth`. */
function flapOutline(M: ManifoldToplevel, k: K, shape: FlapShape, base: number, depth: number): CS {
  if (shape === "triangle") return k(new M.CrossSection([[[-base / 2, 0], [base / 2, 0], [0, depth]]], "NonZero"));
  const r = Math.min(base, depth) * 0.14;
  const bar = k(k(M.CrossSection.square([base, 0.01])).translate([-base / 2, 0]));
  const tip = k(k(M.CrossSection.circle(r, 40)).translate([0, depth - r]));
  return k(M.CrossSection.hull([bar, tip]));
}

function shapes(M: ManifoldToplevel, k: K, p: EnvelopeParams): RegionShape[] {
  const body = k(k(M.CrossSection.square([p.w, p.h], true)).translate([0, 0]));
  const f = p.flapDepth / 100;
  const dTop = (p.h / 2) * f, dSide = (p.w / 2) * f;
  const flap = (id: RegionId, base: number, depth: number, rot: number, ox: number, oy: number, out: Pt): RegionShape => ({
    id, outline: flapOutline(M, k, p.flap, base, depth), w: base, h: depth, cx: 0, cy: depth / 2, rot, ox, oy, out, hinge: [ox, oy],
  });
  return [
    { id: "body", outline: body, w: p.w, h: p.h, cx: 0, cy: 0, rot: 0, ox: 0, oy: 0, out: [0, 0], hinge: [0, 0] },
    flap("top", p.w, dTop, 0, 0, p.h / 2, [0, 1]),
    flap("bottom", p.w, dTop, 180, 0, -p.h / 2, [0, -1]),
    flap("right", p.h, dSide, -90, p.w / 2, 0, [1, 0]),
    flap("left", p.h, dSide, 90, -p.w / 2, 0, [-1, 0]),
  ];
}

/** Coloca uma região feita em coordenadas próprias no lugar dela, no plano da mesa. */
const toTable = (cs: CS, k: K, r: RegionShape): CS => k(k(cs.rotate(r.rot)).translate([r.ox, r.oy]));

export type CustomLace = CS | null;

/** Papel de cada parte e a cor: dois tons juntam as flores às folhas. */
const roleColor = (role: Role, c: EnvelopeColors, tones: 2 | 3) => (role === "Moldura" ? c.frame : role === "Folhas" ? c.leaf : tones === 3 ? c.flower : c.leaf);

/**
 * O envelope em cruz: corpo e quatro abas, cada um com moldura sólida e renda vazada por dentro. A renda do corpo e a
 * de cada aba vêm do mesmo padrão com sementes diferentes. Tudo fica ligado à moldura (ou preso no tule).
 */
export function buildEnvelope(M: ManifoldToplevel, k: K, p: EnvelopeParams, colors: EnvelopeColors, custom: CustomLace): EnvelopeOut {
  const warnings: string[] = [];
  const nozzle = nozzleMm();
  const minWire = Math.max(MIN_WIRE, nozzle * 1.25); // fio mais fino que o bico imprime sobre o tule: 0,5 mm com bico 0,4
  const T = p.tulle ? p.thickness : p.thicknessNoTulle;
  const lh = p.layer;
  const regionsShape = shapes(M, k, p);
  const loose = 0;
  let bridged = 0;
  const perRegion = regionsShape.map((r, idx) => {
    const g2 = p.gap / 2;
    const out0 = k(r.outline.offset(-g2, "Miter"));
    const area = k(out0.offset(-p.frame, "Round"));
    const frame = k(out0.subtract(area));
    let roles: LaceRoles;
    if (p.pattern === "custom" && custom) {
      const fitted = k(fitInto(custom, r.w - 2 * p.frame, r.h - 2 * p.frame, 0));
      const moved = k(fitted.translate([r.cx, r.cy]));
      roles = { leaf: moved, flower: k(M.CrossSection.union([])), stem: k(M.CrossSection.union([])) };
    } else {
      const pat = p.pattern === "custom" ? "floral" : p.pattern;
      const raw = laceRoles(M, k, pat, Math.max(10, r.w - 2 * p.frame), Math.max(10, r.h - 2 * p.frame), p.seed + idx * 101, k(area.translate([-r.cx, -r.cy])), p.density);
      const sh = (cs: CS) => k(cs.translate([r.cx, r.cy]));
      roles = { leaf: sh(raw.leaf), flower: sh(raw.flower), stem: sh(raw.stem) };
    }
    const clip = (cs: CS) => k(cs.intersect(area));
    const leafCs = clip(roles.leaf), flowerCs = clip(roles.flower), stemCs = clip(roles.stem);
    // tudo o que é frame e haste é o tom escuro; flores e folhas têm o delas
    const wingsHere = p.wings && p.tulle && r.id === "top";
    // a aba estreita perto da ponta: a borboleta nunca passa de 80% da largura livre onde ela fica
    const span = Math.min(p.wingSpan, (r.w * 0.5 - 2 * p.frame) * 0.8);
    const but = wingsHere ? butterfly(M, k, span) : null;
    const spot: Pt = [0, r.h * 0.5];
    const foot = but ? k(k(but.whole.offset(1.8, "Round")).translate(spot)) : null;
    // o espaço da borboleta é vazado só na renda: a moldura continua inteira
    const lace = foot ? k(M.CrossSection.union([k(stemCs.subtract(foot)), k(leafCs.subtract(foot)), k(flowerCs.subtract(foot))])) : k(M.CrossSection.union([stemCs, leafCs, flowerCs]));
    const all = k(M.CrossSection.union([frame, lace]));
    // traço fino demais para o bico: engrossa em silêncio nos padrões prontos
    const fixed = fixThinStrokes(M, all, true, minWire);
    k(fixed.cs);
    if (fixed.thin && p.pattern === "custom") warnings.push("O padrão do seu SVG tem traços mais finos que o dobro do bico: engrossei para a renda sair inteira.");
    // nada fica solto, com ou sem tule: o que não encosta na moldura vira fio até ela (o tule só dá mais firmeza)
    const bridgedOne = connectIslands(M, k, fixed.cs, minWire, nozzle * nozzle * MIN_ISLAND_NOZZLES);
    bridged += bridgedOne.bridged;
    const cleaned = bridgedOne.cs;
    const enlarged = k(M.CrossSection.union([cleaned]));
    const flowerFinal = k(enlarged.intersect(flowerCs));
    const leafFinal = k(k(enlarged.intersect(leafCs)).subtract(flowerFinal));
    const darkLace = k(k(enlarged.subtract(flowerFinal)).subtract(leafFinal));
    // asas soltas: planas e separadas do corpo por um vão; presas só pelo tule
    const flat = but ? k(k(k(k(but.whole.subtract(but.eyes)).subtract(k(but.body.offset(0.025 * span, "Round")))).add(but.body)).translate(spot)) : null;
    const darkFinal = flat ? k(M.CrossSection.union([darkLace, k(flat.intersect(area))])) : darkLace;
    return { r, dark: darkFinal, leaf: leafFinal, flower: flowerFinal, out0 };
  });

  const mk = (name: Role, cs: CS, z0: number, z1: number): Part[] => (cs.isEmpty() ? [] : [{ name, color: roleColor(name, colors, p.tones), mesh: toMesh(k(k(cs.extrude(z1 - z0)).translate([0, 0, z0]))) }]);
  const hingeStrips: { r: RegionShape; cs: CS }[] = perRegion
    .filter(({ r }) => r.id !== "body")
    .map(({ r }) => {
      const len = Math.max(4, r.w - 2 * p.frame - 2);
      const bar = k(k(M.CrossSection.square([len, p.gap + 2 * HINGE_OVERLAP])).translate([-len / 2, -(p.gap / 2 + HINGE_OVERLAP)]));
      return { r, cs: toTable(bar, k, r) };
    });

  const regions: EnvelopeRegion[] = perRegion.map(({ r, dark, leaf, flower }) => {
    const t = (cs: CS) => toTable(cs, k, r);
    const strip = p.hinge === "thin" ? hingeStrips.find((h) => h.r.id === r.id)?.cs : undefined;
    const darkTable = t(dark);
    return {
      id: r.id,
      parts: [
        ...mk("Moldura", darkTable, 0, T),
        ...mk("Folhas", t(leaf), 0, T),
        ...mk("Flores", t(flower), 0, T),
        ...(strip ? mk("Moldura", k(strip.subtract(k(darkTable.offset(-HINGE_MERGE, "Miter")))), 0, HINGE_T) : []),
      ],
    };
  });
  const union = (pick: (r: (typeof perRegion)[number]) => CS) => k(M.CrossSection.union(perRegion.map((q) => toTable(pick(q), k, q.r))));
  const darkAll = union((q) => q.dark);
  const strips = p.hinge === "thin" ? k(M.CrossSection.union(hingeStrips.map((h) => h.cs))) : null;
  const parts: Part[] = [
    ...mk("Moldura", darkAll, 0, T),
    ...mk("Folhas", union((q) => q.leaf), 0, T),
    ...mk("Flores", union((q) => q.flower), 0, T),
    ...(strips ? mk("Moldura", k(strips.subtract(k(darkAll.offset(-HINGE_MERGE, "Miter")))), 0, HINGE_T) : []),
  ];

  const f = p.flapDepth / 100;
  const spread = { w: p.w + 2 * (p.w / 2) * f, h: p.h + 2 * (p.h / 2) * f };
  const poses: FlapPose[] = regionsShape.filter((r) => r.id !== "body").map((r) => ({ id: r.id, out: r.out, hinge: r.hinge }));
  let tuleZ: number | null = null, pauseZ: number | null = null;
  if (p.tulle) {
    tuleZ = Math.max(lh, Math.round(p.tuleAt / lh) * lh);
    pauseZ = Math.round((tuleZ + lh) * 1000) / 1000;
    if (T - tuleZ < 2 * lh - 1e-6) warnings.push("O tule entra quase no topo da renda: deixe pelo menos 2 camadas por cima para prendê-lo.");
  }
  return { parts, regions, poses, height: T, tuleZ, pauseZ, spread, warnings, loose, bridged, hingeT: HINGE_T };
}
