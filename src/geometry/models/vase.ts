import type { ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type VaseShape = "circle" | "polygon" | "star";
export type VaseWave = "none" | "radial" | "vertical";

export type VaseParams = {
  /** Raios (mm) dos pontos de controle, de baixo para cima, igualmente espaçados na altura: "40, 55, 48, 32". */
  profile: string;
  height: number;
  shape: VaseShape;
  sides: number; // polígono e estrela
  starDepth: number; // estrela: quanto o vale entra (fração do raio)
  twist: number; // graus, de baixo até em cima
  wave: VaseWave;
  waveAmp: number; // mm
  waves: number;
  mode: "spiral" | "walls"; // espiral = sólido para o "modo vaso" do fatiador; paredes = oco com parede e fundo
  wall: number;
  bottom: number;
  color: string;
};

export const DEFAULT_VASE: VaseParams = {
  profile: "35, 50, 42, 28, 32",
  height: 150,
  shape: "circle",
  sides: 6,
  starDepth: 0.15,
  twist: 0,
  wave: "none",
  waveAmp: 3,
  waves: 8,
  mode: "spiral",
  wall: 1.6,
  bottom: 2,
  color: "#2563eb",
};

export const MIN_POINTS = 4;
export const MAX_POINTS = 8;
const RINGS = 160; // anéis na altura
const SEGMENTS = 240; // pontos por anel
const MIN_RADIUS = 3;
const MAX_OVERHANG_DEG = 60;

/** "40, 55, 48" → [40, 55, 48]; valores inválidos saem; no máximo 8 pontos. */
export function parseProfile(s: string): number[] {
  return s
    .split(/[;,\s]+/)
    .map((x) => Number(x.replace(",", ".")))
    .filter((x) => Number.isFinite(x) && x > 0)
    .slice(0, MAX_POINTS);
}

/** Catmull-Rom uniforme passando pelos pontos `ys` (t de 0 a 1 ao longo de todos). */
export function catmullRom(ys: number[], t: number): number {
  const n = ys.length;
  const x = Math.min(Math.max(t, 0), 1) * (n - 1);
  const i = Math.min(Math.floor(x), n - 2);
  const u = x - i;
  const p0 = ys[Math.max(i - 1, 0)], p1 = ys[i], p2 = ys[i + 1], p3 = ys[Math.min(i + 2, n - 1)];
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

/** Fator do contorno no ângulo θ (1 = círculo): polígono regular ou estrela de `sides` pontas. */
function shapeFactor(p: VaseParams, a: number): number {
  if (p.shape === "circle") return 1;
  const n = Math.max(3, Math.round(p.sides));
  const seg = (2 * Math.PI) / n;
  const local = ((a % seg) + seg) % seg - seg / 2; // −seg/2 … seg/2, 0 no meio do lado
  if (p.shape === "polygon") return Math.cos(Math.PI / n) / Math.cos(local);
  // estrela: ponta no meio de cada setor, vale nas bordas, interpolado em linha
  return 1 - p.starDepth * (Math.abs(local) / (seg / 2));
}

/** Raio no anel `z` (0…1) e ângulo `a`, com ondulação. */
function radiusAt(p: VaseParams, prof: number[], z: number, a: number, inset: number): number {
  let r = catmullRom(prof, z) * shapeFactor(p, a);
  if (p.wave === "radial") r += p.waveAmp * Math.sin(p.waves * a);
  if (p.wave === "vertical") r += p.waveAmp * Math.sin(2 * Math.PI * p.waves * z);
  return Math.max(MIN_RADIUS - inset, r - inset);
}

/** Sólido de revolução por anéis (torção incluída), de z0 a z1 (mm). `inset` encolhe o raio (miolo oco). */
function loft(M: ManifoldToplevel, p: VaseParams, prof: number[], z0: number, z1: number, inset: number): Solid {
  const pos: number[] = [];
  const tri: number[] = [];
  for (let j = 0; j <= RINGS; j++) {
    const zAbs = z0 + ((z1 - z0) * j) / RINGS;
    const z = Math.min(Math.max(zAbs / p.height, 0), 1);
    const rot = (p.twist * Math.PI * z) / 180;
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (2 * Math.PI * i) / SEGMENTS;
      const r = radiusAt(p, prof, z, a, inset);
      pos.push(r * Math.cos(a + rot), r * Math.sin(a + rot), zAbs);
    }
  }
  const bottomC = pos.length / 3;
  pos.push(0, 0, z0);
  const topC = pos.length / 3;
  pos.push(0, 0, z1);
  const v = (j: number, i: number) => j * SEGMENTS + (i % SEGMENTS);
  for (let j = 0; j < RINGS; j++)
    for (let i = 0; i < SEGMENTS; i++) tri.push(v(j, i), v(j, i + 1), v(j + 1, i + 1), v(j, i), v(j + 1, i + 1), v(j + 1, i));
  for (let i = 0; i < SEGMENTS; i++) {
    tri.push(bottomC, v(0, i + 1), v(0, i));
    tri.push(topC, v(RINGS, i), v(RINGS, i + 1));
  }
  const mesh = new M.Mesh({ numProp: 3, vertProperties: new Float32Array(pos), triVerts: new Uint32Array(tri) });
  return M.Manifold.ofMesh(mesh);
}

/** Maior ângulo do perfil com a vertical (balanço), em graus. */
export function maxOverhangDeg(prof: number[], height: number): number {
  const steps = 200;
  let worst = 0;
  for (let k = 0; k < steps; k++) {
    const dr = catmullRom(prof, (k + 1) / steps) - catmullRom(prof, k / steps);
    if (dr > 0) worst = Math.max(worst, (Math.atan2(dr, height / steps) * 180) / Math.PI);
  }
  return worst;
}

/**
 * Vaso paramétrico: perfil por pontos de controle (Catmull-Rom), seção redonda, poligonal ou estrela, torção e
 * ondulação. Modo espiral: sólido para o "modo vaso" do fatiador (uma parede contínua, sem topo). Modo paredes: oco,
 * com parede e fundo.
 */
export function buildVase({ M }: ModelCtx, p: VaseParams): ModelOutput {
  const prof = parseProfile(p.profile);
  if (prof.length < MIN_POINTS) throw new Error(`O perfil precisa de ${MIN_POINTS} a ${MAX_POINTS} raios, separados por vírgula.`);
  return scoped((k) => {
    let vase = k(loft(M, p, prof, 0, p.height, 0));
    if (p.mode === "walls") vase = k(vase.subtract(k(loft(M, p, prof, p.bottom, p.height + 1, p.wall))));
    const warnings: string[] = [];
    const over = maxOverhangDeg(prof, p.height);
    if (over > MAX_OVERHANG_DEG) warnings.push(`O perfil abre ${Math.round(over)}° em relação à vertical: acima de ${MAX_OVERHANG_DEG}° a parede cai. Suavize o ponto que abre de repente.`);
    if (p.mode === "spiral") warnings.push("Modo vaso: o 3MF já vai com o modo espiral ligado (uma parede contínua, sem topo). Use bico 0,4 e 1 perímetro.");
    return { models: [{ name: "Vaso", parts: [{ name: "Vaso", color: p.color, mesh: solidMesh(vase) }] }], warnings };
  });
}
