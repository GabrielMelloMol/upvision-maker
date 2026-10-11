import type { CS } from "../../manifold";
import { crossLap, disc, poly, rect } from "../joints";
import type { KitEnv, KitPair, KitPart, KitTemplate, Placement } from "../types";

/*
 * Foguete de montar (projeto em docs/design/kitcard-foguete-trator.md): cada estágio é um par de placas em cruz (meia-fenda), os
 * estágios se empilham por abas que entram em encaixes, e o conjunto fica de pé numa base de lançamento com dois rasgos em cruz.
 */

const NOSE_TIP = 0.4; // meia-largura da ponta do bico (mm): quase um ponto
const NOSE_CUT = 2.5; // a placa A para onde o bico fica mais estreito que a fenda + pernas (a B segue até a ponta)
const NOSE_POW = 0.75; // < 1: o bico abaulado, como uma ogiva
const STAGE_TOPS = [0.4, 0.68] as const; // fim do estágio 1 e do 2, em fração da altura
const MIN_LIGAMENT = 8; // mm de peça inteira que sobra depois da fenda
const NOSE_STEPS = 24;
/** Altura máxima que ainda cabe no maior cartão (240 × 160) com as folgas e molduras no máximo; acima disso o app limita e avisa. */
export const ROCKET_MAX_H = 145;

type Dim = { H: number; w0: number; fs: number; nh: number; bell: number; wn: number; wb: number; zb: [number, number, number] };

const mirrorPts = (pts: [number, number][]): [number, number][] => pts.map(([x, z]) => [-x, z] as [number, number]).reverse();

/** Contorno do foguete (corpo, sino do motor e bico) em x/z, simétrico. */
function bodyPoints(d: Dim): [number, number][] {
  const right: [number, number][] = [[d.wn, 0], [d.wn, d.nh], [d.wb, d.nh], [d.w0, d.nh + d.bell], [d.w0, d.zb[1]]];
  for (let i = 1; i <= NOSE_STEPS; i++) {
    const s = i / NOSE_STEPS;
    right.push([NOSE_TIP + (d.w0 - NOSE_TIP) * (1 - s) ** NOSE_POW, d.zb[1] + s * (d.H - d.zb[1])]);
  }
  return [...right, ...mirrorPts(right)];
}

/** Aleta do lado direito (enflechada: a ponta desce mais que a raiz) e a do lado esquerdo. */
function finPoints(d: Dim): [number, number][][] {
  const root = d.w0 - 0.6, z0 = d.nh + d.bell, tip = d.w0 + d.fs;
  const right: [number, number][] = [[root, z0], [tip, d.nh], [tip, d.nh + 0.08 * d.H], [root, d.nh + 0.32 * d.H]];
  return [right, right.map(([x, z]) => [-x, z] as [number, number]).reverse()];
}

function dims(H: number, finPct: number, t: number): Dim {
  const w0 = 0.09 * H, nh = t, bell = 0.07 * H;
  return { H, w0, fs: (w0 * finPct) / 100, nh, bell, wn: 0.6 * w0, wb: 0.72 * w0, zb: [H * STAGE_TOPS[0], H * STAGE_TOPS[1], H] };
}

/** As abas de um estágio entram nos encaixes do de cima; ficam a `±plugX` do eixo. */
const plugs = (d: Dim, H: number) => ({ x: 0.45 * d.w0, w: Math.max(3, 0.25 * d.w0), h: Math.max(5, 0.05 * H) });

/** Altura (z) em que o bico fica com meia-largura NOSE_CUT: acima disso só a placa B segue até a ponta. */
const noseCutZ = (d: Dim) => d.zb[1] + (1 - ((NOSE_CUT - NOSE_TIP) / (d.w0 - NOSE_TIP)) ** (1 / NOSE_POW)) * (d.H - d.zb[1]);

type StagePlate = { cs: CS; fin?: CS };

function stagePlate(env: KitEnv, d: Dim, body: CS, fins: CS, stage: 0 | 1 | 2, plane: "a" | "b", windows: boolean): StagePlate {
  const { M, k, t, fit } = env;
  const lo = stage === 0 ? -1 : d.zb[stage - 1], hi = d.zb[stage];
  const cutA = stage === 2 && plane === "a"; // o bico da placa A termina onde a fenda e as pernas deixam de caber
  const top = cutA ? noseCutZ(d) : hi;
  const pg = plugs(d, d.H);
  const band = rect(M, k, -200, lo, 200, top);
  let cs: CS = k(body.intersect(band));
  // abas no topo (entram no encaixe do estágio de cima)
  if (stage < 2) for (const sx of [-1, 1]) cs = k(cs.add(rect(M, k, sx * pg.x - pg.w / 2, hi - 0.01, sx * pg.x + pg.w / 2, hi + pg.h)));
  // encaixes embaixo (as abas do estágio de baixo entram aqui), folga somada
  if (stage > 0) for (const sx of [-1, 1]) cs = k(cs.subtract(rect(M, k, sx * pg.x - (pg.w + fit) / 2, lo - 1, sx * pg.x + (pg.w + fit) / 2, lo + pg.h + fit / 2)));
  // janelinhas redondas no estágio 2
  if (windows && stage === 1) {
    const r = Math.max(1.2, 0.17 * d.w0), z = lo + 0.72 * (hi - lo);
    for (const sx of [-1, 1]) cs = k(cs.subtract(disc(M, k, sx * 0.5 * d.w0, z, r)));
  }
  // meia-fenda: A abre por cima, B por baixo; cada uma passa da metade para as duas se sobreporem
  // estágio com bico: a B (inteira até a ponta) leva a fenda quase toda; a A, só o que falta para as duas se cobrirem
  const height = hi - Math.max(lo, 0), nose = stage === 2;
  const depthB = nose ? height - MIN_LIGAMENT : Math.min(height / 2 + 0.5, height - MIN_LIGAMENT);
  const depth = plane === "b" ? depthB : nose ? Math.max(3, top - (Math.max(lo, 0) + depthB) + 1) : depthB;
  const slot = plane === "a" ? crossLap(M, k, { x: 0, edge: top, depth, from: "top", t, fit }) : crossLap(M, k, { x: 0, edge: Math.max(lo, 0), depth, from: "bottom", t, fit });
  cs = k(cs.subtract(slot));
  const fin = stage === 0 ? k(k(fins.intersect(band)).subtract(slot)) : undefined;
  return { cs, fin };
}

export const rocketKit: KitTemplate = {
  id: "kitRocket",
  label: "Foguete (kit de montar)",
  blurb: "Foguete de 3 estágios que se encaixam, com aletas e janelinhas, numa base de lançamento. Peças planas num cartão: cada estágio é um par de placas em cruz.",
  palette: [
    { key: "s1", label: "Estágio 1", default: "#f4f4f2" },
    { key: "s2", label: "Estágio 2", default: "#d6262e" },
    { key: "nose", label: "Bico", default: "#f4f4f2" },
    { key: "fin", label: "Aletas", default: "#2563eb" },
    { key: "base", label: "Base de lançamento", default: "#1c1c1e" },
  ],
  artTargets: [["a2", "Estágio 2 (lado)"], ["base", "Base de lançamento"]],
  defaults: { cardSize: "xlarge", height: 140, finSpan: 90, windows: true },
  sections: [
    {
      title: "Foguete",
      fields: [
        { k: "height", kind: "num", label: "Altura do foguete", min: 80, max: ROCKET_MAX_H, step: 5, unit: "mm", hint: "Altura montado, sem a base. O cartão cresce junto (o maior cartão limita em 145 mm)." },
        { k: "finSpan", kind: "num", label: "Tamanho das aletas", min: 50, max: 130, step: 5, unit: "%", hint: "100% = a aleta sai do corpo tanto quanto a meia-largura do foguete." },
        { k: "windows", kind: "bool", label: "Janelinhas redondas no estágio 2" },
      ],
    },
  ],
  build: (env) => {
    const { M, k, t, fit, scale, p } = env;
    const want = Number(p.height) * scale;
    const H = Math.min(want, ROCKET_MAX_H);
    const d = dims(H, Number(p.finSpan), t);
    const windows = Boolean(p.windows);
    const body = poly(M, k, bodyPoints(d));
    const fins = k(M.CrossSection.union(finPoints(d).map((f) => poly(M, k, f))));
    const finsOnly = k(fins.subtract(body));
    const colors = ["s1", "s2", "nose"] as const;
    const parts: KitPart[] = [];
    const assembly: Placement[] = [];
    const pairs: KitPair[] = [];

    // base de lançamento: disco com dois rasgos em cruz para o bocal
    const rb = d.w0 + d.fs + 5, half = d.wn + fit / 2, sw = (t + fit) / 2;
    const slots = k(M.CrossSection.union([rect(M, k, -half, -sw, half, sw), rect(M, k, -sw, -half, sw, half)]));
    parts.push({ id: "base", label: "Base de lançamento", layers: [{ cs: k(disc(M, k, 0, 0, rb, 64).subtract(slots)), color: "base" }] });
    assembly.push({ part: "base", translate: [0, 0, 0] });

    for (const stage of [0, 1, 2] as const) {
      for (const plane of ["a", "b"] as const) {
        const id = `${plane}${stage + 1}`;
        const sp = stagePlate(env, d, body, finsOnly, stage, plane, windows);
        const layers = [{ cs: sp.cs, color: colors[stage] }, ...(sp.fin ? [{ cs: sp.fin, color: "fin" }] : [])];
        parts.push({ id, label: `${["Estágio 1", "Estágio 2", "Bico"][stage]} (${plane.toUpperCase()})`, layers });
        assembly.push(plane === "a" ? { part: id, rotate: [90, 0, 0], translate: [0, t / 2, 0] } : { part: id, rotate: [90, 0, 90], translate: [-t / 2, 0, 0] });
      }
      pairs.push({ a: `a${stage + 1}`, b: `b${stage + 1}`, kind: "slot-slot" });
      if (stage < 2) for (const plane of ["a", "b"]) pairs.push({ a: `${plane}${stage + 1}`, b: `${plane}${stage + 2}`, kind: "other", gap: fit });
    }
    pairs.push({ a: "base", b: "a1", kind: "tab-window" }, { a: "base", b: "b1", kind: "tab-window" });

    const warnings: string[] = [];
    if (want > ROCKET_MAX_H) warnings.push(`O foguete de ${Math.round(want)} mm não cabe no maior cartão: limitei a ${ROCKET_MAX_H} mm. Para um maior, imprima as peças em mais de um cartão.`);
    if (windows && 0.17 * d.w0 < 1.2) warnings.push("Foguete pequeno: as janelinhas ficam com menos de 2,4 mm e podem não sair bem.");
    if (t < 1.4) warnings.push("Espessura abaixo de 1,4 mm: as pernas do bico ficam frágeis.");
    return {
      parts,
      assembly,
      pairs,
      warnings,
      steps: [
        "Em cada estágio, encaixe {a1} em {b1}, {a2} em {b2} e {a3} em {b3} pelas fendas (uma abre por cima, a outra por baixo).",
        "Empilhe: as abas de {a1} e {b1} entram nos encaixes de {a2} e {b2}; as de {a2} e {b2}, nos do bico {a3} e {b3}.",
        "Encaixe o bocal do foguete nos rasgos da base {base}.",
      ],
    };
  },
};

