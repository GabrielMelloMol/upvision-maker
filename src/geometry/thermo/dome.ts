import type { CS, ManifoldToplevel, Solid } from "../manifold";

type K = <D extends { delete(): void }>(o: D) => D;

/** Domo: altura, curvatura (expoente da superelipse: 2 = elipse, maior = topo mais reto) e o quanto o contorno recua até o topo. */
export type DomeGeo = { L: number; H: number; q: number };

const DZ = 0.4; // degrau de altura do molde: de camada em camada, sem escada que se veja
const MAX_SLICES = 70;
const ARC_STEPS = 240;

/** Maior recuo do contorno antes de sumir (o "raio" da maior circunferência que cabe): onde fica o topo do domo. */
export function inradius(cs: CS): number {
  let lo = 0, hi = Math.max(...[0, 1].map((i) => cs.bounds().max[i] - cs.bounds().min[i])) / 2;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const inner = cs.offset(-mid, "Round");
    const empty = inner.isEmpty() || inner.area() < 1e-3;
    inner.delete();
    if (empty) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** Recuo do contorno na altura z (0 na base, L no topo). */
export const insetAt = (z: number, g: DomeGeo): number => {
  const u = Math.min(Math.max(z / g.H, 0), 1);
  return g.L * (1 - Math.pow(Math.max(0, 1 - Math.pow(u, g.q)), 1 / g.q));
};

export const sliceCount = (zMax: number) => Math.min(MAX_SLICES, Math.max(6, Math.ceil(zMax / DZ)));

/**
 * Domo (ou a casca de fora dele, com `e` > 0) como pilha de fatias: em cada altura, o contorno recuado do que o perfil pede.
 * Cada fatia é mais estreita que a de baixo, então o molde imprime sem suporte. Quem chama apaga o resultado.
 */
export function domeStack(M: ManifoldToplevel, sil: CS, g: DomeGeo, e: number, k: K): Solid {
  const zMax = g.H + e;
  // o degrau é o do domo sem folga: a casca de fora (e > 0) tem os mesmos planos de corte e envolve o macho sem fresta nem invasão
  const dz = g.H / sliceCount(g.H);
  const n = Math.max(1, Math.ceil(zMax / dz - 1e-9));
  const parts: Solid[] = [];
  for (let i = 0; i < n; i++) {
    const z0 = i * dz;
    const slab = k(sil.offset(e - insetAt(z0, g), "Round"));
    if (slab.isEmpty() || slab.area() < 1e-3) break;
    const ext = k(slab.extrude(dz + (i === n - 1 ? 0 : 0.001)));
    parts.push(k(ext.translate([0, 0, z0])));
  }
  return k(M.Manifold.union(parts));
}

/** Perfil do domo como polilinha (raio visto de cima × altura), do topo à borda, e o comprimento de arco acumulado. */
export function domeArc(g: DomeGeo): { rho: number[]; z: number[]; arc: number[] } {
  const rho: number[] = [], z: number[] = [], arc: number[] = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const th = Math.PI / 2 - (i / ARC_STEPS) * (Math.PI / 2); // topo (θ = π/2) → borda (θ = 0)
    rho.push(g.L * Math.pow(Math.max(0, Math.cos(th)), 2 / g.q));
    z.push(g.H * Math.pow(Math.max(0, Math.sin(th)), 2 / g.q));
    arc.push(i === 0 ? 0 : arc[i - 1] + Math.hypot(rho[i] - rho[i - 1], z[i] - z[i - 1]));
  }
  return { rho, z, arc };
}

/**
 * Quanto a tela estica ao ser prensada: S = comprimento do perfil / L (a borda fica presa no apoio, o miolo sobe).
 * `magnification(r)`: quanto um ponto a r mm do centro da tela plana se afasta do centro visto de cima; o desenho
 * desenhado r aparece maior por esse fator, então se encolhe por 1/fator para sair do tamanho pedido.
 */
export function stretchOf(g: DomeGeo): { S: number; magnification: (r: number) => number } {
  const { rho, arc } = domeArc(g);
  const total = arc[arc.length - 1];
  const S = total / g.L;
  const at = (target: number): number => {
    let i = 1;
    while (i < arc.length - 1 && arc[i] < target) i++;
    const t = (target - arc[i - 1]) / Math.max(1e-9, arc[i] - arc[i - 1]);
    return rho[i - 1] + t * (rho[i] - rho[i - 1]);
  };
  return { S, magnification: (r) => (r <= 1e-6 ? S : at(Math.min(S * r, total)) / r) };
}
