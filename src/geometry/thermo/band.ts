import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { toMesh } from "../mesh";
import { scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { DEFAULT_SCREEN, screenRegions } from "./screen";

type K = <D extends { delete(): void }>(o: D) => D;

export type BandParams = {
  /** Circunferência do pulso (mm): é a do mandril, onde a pulseira é enrolada. */
  wrist: number;
  width: number;
  t: number;
  /** Abertura do "C" (mm). Negativa = a pulseira passa de uma volta e as pontas se sobrepõem. */
  opening: number;
  /** Borda sólida em volta da tira; a malha é opcional (senão a tira é inteira). */
  border: number;
  mesh: "solid" | "honeycomb" | "diamond";
  aperture: number;
  wire: number;
  /** Folga do mandril: o diâmetro do mandril é o do pulso mais isto (a pulseira volta um pouco ao esfriar). */
  mandrelEase: number;
  colors: { strip: string; border: string; design: string; mandrel: string };
};

export const DEFAULT_BAND: BandParams = {
  wrist: 200,
  width: 20,
  t: 1.2,
  opening: 25,
  border: 2.4,
  mesh: "solid",
  aperture: 3,
  wire: 1.2,
  mandrelEase: 0,
  colors: { strip: "#c0392b", border: "#c0392b", design: "#f4f4f2", mandrel: "#3b82f6" },
};

export const BAND_LIMITS = { wrist: [110, 240], width: [8, 45], t: [0.8, 2], opening: [-20, 70] } as const;

export type BandInfo = {
  /** Comprimento da tira plana, diâmetro do mandril e altura dele. */
  length: number;
  mandrelD: number;
  mandrelH: number;
  /** Quanto a tira dá de volta no mandril, em graus (volta inteira = 360). */
  sweep: number;
};

export type BandOut = { strip: Model[]; mandrel: Model[]; assembled: Model; warnings: string[]; info: BandInfo };

const SEGMENTS = 120;
const END_ROUND = 6; // pontas arredondadas da tira
const MANDREL_PAD = 8; // o mandril é mais alto que a tira
const CHAMFER = 1.2;
const OVERLAP_RAMP = 6;
const WARP_MM = 0.8;
const PREVIEW_LIFT = 0;

const solidPart = (name: string, color: string, s: Solid | null): Part[] => (s ? [{ name, color, mesh: toMesh(s) }] : []);
const extruded = (cs: CS, h: number, k: K): Solid | null => (cs.isEmpty() ? null : k(cs.extrude(h)));

/** Comprimento da tira plana: o pulso menos a abertura do C (mais, se a abertura for negativa e as pontas se sobrepuserem). */
export const stripLength = (p: Pick<BandParams, "wrist" | "opening">) => p.wrist - p.opening;

/**
 * Pulseira termoformada: uma tira de PLA (inteira ou com malha, com borda e um desenho opcional) aquecida e enrolada num mandril de
 * PETG com o diâmetro do pulso. O mandril fica em pé, com as bordas chanfradas. `design` é o texto ou logo (já em mm, centrado).
 */
export function buildBand(M: ManifoldToplevel, p: BandParams, design: CS | null, opts: { preview?: boolean } = {}): BandOut {
  const preview = opts.preview ?? true;
  return scoped((k) => {
    const warnings: string[] = [];
    const L = stripLength(p);
    const mandrelD = (p.wrist + p.mandrelEase) / Math.PI;
    if (L < 40) warnings.push("A tira ficou muito curta: diminua a abertura do C.");
    if (p.opening < 8 && p.opening >= 0) warnings.push("Com uma abertura pequena a pulseira não passa pela mão: use uns 20 a 30 mm de abertura, ou deixe as pontas se sobrepor (abertura negativa).");
    if (p.opening < 0) warnings.push("As pontas se sobrepõem: a pulseira passa de uma volta. Aqueça devagar e enrole sem apertar demais para ela ainda abrir.");
    if (p.t > 1.6) warnings.push("Tira grossa: demora mais para amolecer e pode não dobrar redonda. Use até 1,5 mm.");

    const r = Math.min(END_ROUND, p.width / 2 - 0.01);
    const strip = k(k(M.CrossSection.square([L - 2 * r, p.width - 2 * r], true)).offset(r, "Round"));
    const art = design ? k(design.intersect(k(strip.offset(-(p.border + 1), "Round")))) : null;
    let border: CS, mesh: CS, dsg: CS;
    if (p.mesh === "solid") {
      const inner = k(strip.offset(-p.border, "Round"));
      border = k(strip.subtract(inner));
      mesh = art && !art.isEmpty() ? k(inner.subtract(art)) : inner;
      dsg = art ?? k(M.CrossSection.square([0.001, 0.001]));
    } else {
      const reg = screenRegions(M, strip, art, { ...DEFAULT_SCREEN, border: p.border, mesh: p.mesh, aperture: p.aperture, wire: p.wire }, k);
      border = k(reg.border);
      mesh = k(reg.mesh);
      dsg = k(reg.design);
    }
    const c = p.colors;
    const hasDesign = !!art && !art.isEmpty();
    const stripParts: Part[] = [...solidPart("Borda", c.border, extruded(border, p.t, k)), ...solidPart("Tira", c.strip, extruded(mesh, p.t, k)), ...(hasDesign ? solidPart("Desenho", c.design, extruded(dsg, p.t, k)) : [])];
    const stripModel: Model = { name: "Tira da pulseira", parts: stripParts };

    // mandril em pé: cilindro com as bordas chanfradas, mais alto que a tira
    const Rm = mandrelD / 2, Hm = p.width + MANDREL_PAD;
    const profile = k(new M.CrossSection([[[0, 0], [Rm - CHAMFER, 0], [Rm, CHAMFER], [Rm, Hm - CHAMFER], [Rm - CHAMFER, Hm], [0, Hm]]], "NonZero"));
    const mandrel = k(M.Manifold.revolve(profile, SEGMENTS));
    const mandrelModel: Model = { name: "Mandril", parts: [{ name: "Mandril", color: c.mandrel, mesh: toMesh(mandrel) }] };

    let assembled: Model = { name: "Pulseira pronta (não imprime)", previewOnly: true, parts: [] };
    if (preview) {
      const around = (cs: CS): Solid | null => {
        if (cs.isEmpty()) return null;
        const flat = k(cs.extrude(p.t));
        const fine = k(flat.refineToLength(WARP_MM));
        // x → ângulo ao longo do mandril (o meio da tira de frente); y (largura) → altura do mandril; espessura → raio
        return k(
          fine.warpBatch((v, n) => {
            for (let i = 0; i < n; i++) {
              const o = i * 3;
              const s = v[o] + L / 2, w = v[o + 1], zf = v[o + 2];
              const ramp = Math.min(1, Math.max(0, (s - p.wrist) / OVERLAP_RAMP)); // passando de uma volta, sobe uma espessura
              const R = Rm + PREVIEW_LIFT + zf + p.t * ramp;
              const a = -Math.PI / 2 + (s - L / 2) / Rm; // o meio da tira de frente (−y), lida da esquerda para a direita; a abertura fica atrás
              v[o] = R * Math.cos(a);
              v[o + 1] = R * Math.sin(a);
              v[o + 2] = w + Hm / 2;
            }
          }),
        );
      };
      assembled = {
        name: "Pulseira pronta (não imprime)",
        previewOnly: true,
        parts: [...solidPart("Borda", c.border, around(border)), ...solidPart("Tira", c.strip, around(mesh)), ...(hasDesign ? solidPart("Desenho", c.design, around(dsg)) : [])],
      };
    }

    const info: BandInfo = { length: L, mandrelD, mandrelH: Hm, sweep: (L / p.wrist) * 360 };
    return { strip: [stripModel], mandrel: [mandrelModel], assembled, warnings, info };
  });
}
