import { bedHeight, bedMm } from "../bed";
import type { ManifoldToplevel } from "../manifold";
import type { Solid } from "../manifold";
import { scoped } from "../shape2d";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type SpoolHolderParams = {
  /** Diâmetro de fora do carretel e largura entre as abas, mm. */
  spoolD: number;
  spoolW: number;
  /** Furo central do carretel. */
  hole: number;
  /** Folga do eixo no furo do carretel e no encaixe dos postes. */
  clearance: number;
  socketGap: number;
  thickness: number;
  /** Parede do eixo oco (tubo), mm. */
  axleWall: number;
  /** Eixo inteiro ou em duas partes que rosqueiam (para quem não tem altura para imprimir em pé). */
  axleParts: "one" | "two";
  color: string;
  axleColor: string;
};

export const DEFAULT_SPOOL_HOLDER: SpoolHolderParams = { spoolD: 200, spoolW: 70, hole: 53, clearance: 1, socketGap: 0.25, thickness: 8, axleWall: 3.5, axleParts: "one", color: "#1f2937", axleColor: "#f59e0b" };

const SIDE_GAP = 3; // folga entre o carretel e cada poste
const ABOVE = 4; // o carretel fica a esta altura da base
const BASE_T = 5;
const HEAD_EXTRA = 8; // cabeça do eixo: raio a mais
const HEAD_T = 4;
const SEG = 96;
const GAP = 12;
const PLA_G_CM3 = 1.24;
const JOINT_LEN = 16; // trecho da rosca de cada parte do eixo
const THREAD_DEPTH = 1.4, THREAD_PITCH = 4, THREAD_FIT = 0.35;
const TWIST_STEP = 0.5;


/** Rosca de 2 entradas: seção com dentes trapezoidais, torcida ao longo do eixo (como a do Estojo). Quem chama dá delete(). */
function thread(M: ManifoldToplevel, rMinor: number, h: number, grow: number): Solid {
  return scoped((k) => {
    const n = 2, count = 96 * n, rise = 0.3;
    const shape = (t: number) => (t < rise ? t / rise : t < 1 - rise ? 1 : (1 - t) / rise);
    const pts: [number, number][] = Array.from({ length: count }, (_, i) => {
      const a = (2 * Math.PI * i) / count;
      const r = rMinor + grow + THREAD_DEPTH * shape(((a * n) / (2 * Math.PI)) % 1);
      return [r * Math.cos(a), r * Math.sin(a)];
    });
    const cs = k(new M.CrossSection([pts], "Positive"));
    return cs.extrude(h, Math.ceil(h / TWIST_STEP), (360 * h) / (THREAD_PITCH * n));
  });
}

/**
 * Suporte de carretel (#234): base com dois postes e um eixo solto. O eixo (diâmetro do furo menos a folga) atravessa um poste,
 * o carretel e o outro poste; a cabeça do eixo trava de um lado. O carretel gira apoiado só no eixo, sem encostar na base.
 */
export function buildSpoolHolder(ctx: ModelCtx, p: SpoolHolderParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const axleD = p.hole - 2 * p.clearance;
    const socketD = axleD + 2 * p.socketGap;
    const axleZ = BASE_T + ABOVE + p.spoolD / 2; // altura do centro do eixo
    const span = p.spoolW + 2 * SIDE_GAP; // vão entre os postes
    const L = span + 2 * p.thickness + 24, W = Math.max(70, p.spoolD * 0.55);
    // base
    const base = k(k(M.Manifold.cube([L, W, BASE_T], false)).translate([-L / 2, -W / 2, 0]));
    // postes: placa em pé com o topo arredondado, furo do eixo
    const post = (x: number): Solid => {
      const r = socketD / 2 + 7;
      const body = k(M.Manifold.union([k(k(M.Manifold.cube([p.thickness, 2 * r + 20, axleZ], false)).translate([0, -(r + 10), 0])), k(k(M.Manifold.cylinder(p.thickness, r, r, SEG)).rotate([0, 90, 0])).translate([0, 0, axleZ])]));
      const hole = k(k(k(M.Manifold.cylinder(p.thickness + 2, socketD / 2, socketD / 2, SEG)).rotate([0, 90, 0])).translate([-1, 0, axleZ]));
      return k(k(body.subtract(hole)).translate([x, 0, 0]));
    };
    const x1 = -span / 2 - p.thickness, x2 = span / 2;
    const stand = k(M.Manifold.union([base, post(x1), post(x2)]));
    // eixo oco (tubo), em pé na mesa: haste com a ponta chanfrada e a cabeça numa ponta
    const axleLen = span + 2 * p.thickness + 10;
    const R = axleD / 2, bore = Math.max(2, R - p.axleWall);
    // tubo por revolução do perfil (raio, altura); a ponta chanfrada ajuda a entrar nos furos
    const tube = (len: number, tipChamfer: boolean): Solid => {
      const tipR = tipChamfer ? R - 1.2 : R;
      const pts: [number, number][] = [[bore, 0], [R, 0], [R, len - (tipChamfer ? 2 : 0)], [tipR, len], [bore, len]];
      return k(M.Manifold.revolve(k(new M.CrossSection([pts], "NonZero")), SEG));
    };
    const head = k(k(M.Manifold.cylinder(HEAD_T, R + HEAD_EXTRA, R + HEAD_EXTRA, SEG)).translate([0, 0, -HEAD_T]));
    const x0 = L / 2 + GAP + R + HEAD_EXTRA;
    const parts: { name: string; color: string; mesh: ReturnType<typeof solidMesh> }[] = [];
    let axleVol = 0;
    const partOf = (name: string, s0: Solid, dx: number) => {
      const placed = k(s0.translate([dx, 0, 0]));
      axleVol += s0.volume();
      parts.push({ name, color: p.axleColor, mesh: solidMesh(placed) });
    };
    const mm3 = (v: number) => v / 1000;
    let axleNote = "";
    if (p.axleParts === "two") {
      // parte A: cabeça + tubo com a luva roscada por dentro na ponta; parte B: tubo com o pino roscado na ponta
      const half = axleLen / 2 + JOINT_LEN / 2;
      const rm = bore - THREAD_DEPTH - 0.4;
      const a0 = k(M.Manifold.union([head, tube(half, false)]).translate([0, 0, HEAD_T]));
      const fill = k(k(M.Manifold.cylinder(JOINT_LEN, bore + 0.05, bore + 0.05, SEG)).translate([0, 0, HEAD_T + half - JOINT_LEN]));
      const female = k(k(thread(M, rm, JOINT_LEN + 1, THREAD_FIT)).translate([0, 0, HEAD_T + half - JOINT_LEN - 0.5]));
      const partA = k(k(M.Manifold.union([a0, fill])).subtract(female));
      const bLen = axleLen - half + JOINT_LEN;
      const bTube = tube(bLen, true);
      const plug = k(k(thread(M, rm, JOINT_LEN, 0)).translate([0, 0, bLen - 0.01]));
      const cap = k(k(M.Manifold.cylinder(3, R, R, SEG)).translate([0, 0, bLen - 3])); // fecha o tubo no lado da rosca e segura o pino
      const partB = k(k(M.Manifold.union([bTube, cap, plug])).rotate([180, 0, 0]));
      const bb = partB.boundingBox();
      partOf("Eixo (parte 1)", partA, x0);
      partOf("Eixo (parte 2)", k(partB.translate([0, 0, -bb.min[2]])), x0 + 2 * (R + HEAD_EXTRA) + GAP);
      axleNote = "em 2 partes que rosqueiam";
    } else {
      partOf("Eixo", k(k(M.Manifold.union([head, tube(axleLen, true)])).translate([0, 0, HEAD_T])), x0);
      if (axleLen + HEAD_T > bedHeight()) warnings.push(`O eixo tem ${Math.round(axleLen)} mm e a impressora imprime até ${bedHeight()} mm de altura: escolha o eixo em 2 partes rosqueadas.`);
    }
    const grams = (mm3(axleVol) * PLA_G_CM3).toFixed(0);
    warnings.push(`Eixo oco ${axleNote || "inteiro"}: ≈ ${grams} g de PLA (parede de ${p.axleWall.toFixed(1).replace(".", ",")} mm; um eixo maciço seria ≈ ${Math.round(((Math.PI * R * R * axleLen) / 1000) * PLA_G_CM3)} g).`);
    if (p.spoolW + 2 * p.thickness + 24 > bedMm() || W > bedMm()) warnings.push(`A base tem ${Math.round(L)} × ${Math.round(W)} mm: passa da mesa de ${bedMm()} mm.`);
    if (axleZ > bedMm()) warnings.push("Os postes ficam mais altos que a impressora: use um carretel menor.");
    if (p.clearance < 0.5) warnings.push("Folga pequena: o carretel pode agarrar no eixo.");
    return {
      models: [
        { name: "Base", parts: [{ name: "Base", color: p.color, mesh: solidMesh(stand) }] },
        ...parts.map((x) => ({ name: x.name, parts: [x] })),
      ],
      warnings,
    };
  });
}
