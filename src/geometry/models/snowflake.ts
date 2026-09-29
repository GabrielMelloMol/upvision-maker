import type { CS, ManifoldToplevel } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import { slab, type ModelCtx, type ModelOutput } from "./common";

export type SnowflakeParams = {
  name: string;
  seed: number; // muda o desenho do floco
  arms: number;
  diameter: number;
  thickness: number;
  relief: number;
  flakeColor: string;
  nameColor: string;
};

export const DEFAULT_SNOWFLAKE: SnowflakeParams = { name: "Ana", seed: 7, arms: 6, diameter: 80, thickness: 2.4, relief: 0.8, flakeColor: "#7cc4f5", nameColor: "#f8f8f6" };

const LOOP_OUT = 4;
const LOOP_IN = 2;

/** Gerador pseudoaleatório com semente (mulberry32): o mesmo número dá sempre o mesmo floco. */
export function rng(seed: number): () => number {
  let a = Math.floor(seed) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type K = <D extends { delete(): void }>(o: D) => D;

/** Um braço (apontando para +y) com galhos simétricos e ponta em losango. */
function arm(M: ManifoldToplevel, k: K, R: number, r0: number, w: number, rand: () => number): CS {
  const pieces: CS[] = [k(k(M.CrossSection.square([w, R - r0], false)).translate([-w / 2, r0]))];
  const branches = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < branches; i++) {
    const at = r0 + (R - r0) * (0.25 + (0.6 * (i + rand() * 0.5)) / branches);
    const len = (R - r0) * (0.18 + rand() * 0.22) * (1 - (at - r0) / (R - r0) * 0.5);
    const bw = w * (0.7 + rand() * 0.3);
    for (const s of [-1, 1]) pieces.push(k(k(k(k(M.CrossSection.square([bw, len], false)).translate([-bw / 2, 0])).rotate(s * 60)).translate([0, at])));
  }
  const tip = w * (1.4 + rand());
  pieces.push(k(k(k(M.CrossSection.square([tip, tip], true)).rotate(45)).translate([0, R - tip * 0.3])));
  return k(M.CrossSection.union(pieces));
}

/**
 * Enfeite floco de neve com nome: braços gerados por semente (cada número dá um floco diferente, sempre simétrico),
 * disco no centro com o nome em relevo e argola na ponta do braço de cima.
 */
export function buildSnowflake({ M, text }: ModelCtx, p: SnowflakeParams): ModelOutput {
  return scoped((k) => {
    const R = p.diameter / 2;
    const n = Math.round(p.arms);
    const rand = rng(p.seed);
    const w = Math.max(2.2, R * 0.07);
    const raw = p.name.trim() ? text(p.name, 100) : null;
    const nameW = R * 0.9;
    const name = raw ? k(fitInto(k(raw), nameW, R * 0.28, 0)) : null;
    const r0 = name ? Math.max(R * 0.3, (name.bounds().max[0] - name.bounds().min[0]) / 2 + 3) : R * 0.2;
    const one = arm(M, k, R, r0 * 0.8, w, rand);
    const arms = Array.from({ length: n }, (_, i) => k(one.rotate((360 * i) / n)));
    const center = k(M.CrossSection.circle(r0, 6 * 8));
    const loopC: [number, number] = [0, R + LOOP_OUT - 1];
    const loop = k(k(k(M.CrossSection.circle(LOOP_OUT, 32)).subtract(k(M.CrossSection.circle(LOOP_IN, 24)))).translate(loopC));
    const flake = k(M.CrossSection.union([...arms, center, loop]));
    const parts = [{ name: "Floco", color: p.flakeColor, mesh: slab(flake, p.thickness) }];
    if (name) parts.push({ name: "Nome", color: p.nameColor, mesh: slab(k(name.intersect(k(center.offset(-1, "Round")))), p.relief, p.thickness) });
    return { models: [{ name: p.name.trim() || "Floco de neve", parts }] };
  });
}
