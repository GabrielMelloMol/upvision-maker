import type { CS } from "../../manifold";
import { disc, pinHole, rect } from "../joints";
import type { KitEnv, KitPart, Placement } from "../types";

/** Peças e medidas que os modelos de kit (avião, helicóptero) repartem. */

/** Raio do pino de hélice, de roda e de trava. */
export const PIN_R = 1.5;
/** Vão entre a trava e a peça que ela prende. */
export const LOCK_GAP = 0.3;
/** Raio da trava. */
export const LOCK_R = 4.5;

export const sc = (pts: [number, number][], s: number): [number, number][] => pts.map(([a, b]) => [a * s, b * s]);

export const place = (part: string, translate: [number, number, number], rotate?: [number, number, number], index?: number): Placement => ({ part, translate, ...(rotate ? { rotate } : {}), ...(index ? { index } : {}) });

/** Folga do furo giratório (o pino gira solto): vem do parâmetro `spin` do kit. */
export const spinOf = (e: KitEnv) => Number(e.p.spin);

/** Hélice: cubo redondo com `n` pás elípticas (`len` de comprimento e `halfW` de meia-largura), todas do mesmo plano. */
export function rotorShape(e: KitEnv, o: { n: number; len: number; halfW: number; hub: number }): CS {
  const { M, k } = e;
  const blades = Array.from({ length: o.n }, (_, i) => {
    const blade = k(k(M.CrossSection.circle(1, 40)).scale([o.halfW, o.len / 2]));
    return k(k(blade.translate([0, o.len / 2])).rotate((360 / o.n) * i));
  });
  return k(M.CrossSection.union([disc(M, k, 0, 0, o.hub), ...blades]));
}

/** Trava: disco com furo que entra por pressão no pino e segura a peça que gira. */
export function lockPart(e: KitEnv, o: { id: string; label: string; color: string; count?: number; r?: number }): KitPart {
  const { M, k, pinFit } = e;
  const cs = k(disc(M, k, 0, 0, o.r ?? LOCK_R).subtract(pinHole(M, k, { x: 0, y: 0, r: PIN_R, fit: pinFit })));
  return { id: o.id, label: o.label, ...(o.count ? { count: o.count } : {}), layers: [{ cs, color: o.color }] };
}

/** Caverna/anteparo: placa que fica de pé entre as laterais e entra nas janelas delas por abas nas duas pontas. */
export function bulkhead(e: KitEnv, o: { half: number; v0: number; v1: number; tabC: number; tabH: number; holes?: CS[] }): CS {
  const { M, k, t } = e;
  const body = rect(M, k, -o.half, o.v0, o.half, o.v1);
  const reach = o.half + 0.05 + t + 0.5; // a face de dentro da lateral fica em half + 0,05; passa 0,5 mm da de fora
  const [y0, y1] = [o.tabC - o.tabH / 2, o.tabC + o.tabH / 2];
  const tabs = [rect(M, k, o.half - 0.01, y0, reach, y1), rect(M, k, -reach, y0, -o.half + 0.01, y1)];
  const all = k(M.CrossSection.union([body, ...tabs]));
  return o.holes?.length ? k(all.subtract(k(M.CrossSection.union(o.holes)))) : all;
}
