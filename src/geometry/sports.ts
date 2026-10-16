import type { CS, ManifoldToplevel } from "./manifold";
import { scoped } from "./shape2d";

/**
 * Silhuetas de atletas (#223): cada esporte é uma lista de membros (cápsulas afuniladas entre duas bolinhas), bolinhas
 * (cabeça, bola, anilhas) e anéis (aro da raquete, rodas). Coordenadas em "unidades" com o chão em y = 0 e o atleta de
 * pé com ~100 de altura; tudo é uma peça só (os pés ficam sobre um chão que liga a figura à base).
 */
type V = [number, number];
/** x1, y1, r1, x2, y2, r2: cápsula afunilada. */
type Limb = [number, number, number, number, number, number];
type Dot = [number, number, number];
type Ring = [number, number, number, number]; // x, y, raio de fora, raio de dentro

export type SportShape = { limbs: Limb[]; dots: Dot[]; rings: Ring[]; floor: [number, number] };

type Person = {
  head: V;
  sh: V;
  hip: V;
  arms: [V, V][]; // cotovelo, mão
  legs: [V, V, V][]; // joelho, tornozelo, ponta do pé
  hand?: number; // raio da mão (luva maior no boxe)
};

const HEAD_R = 7.4;

/** Corpo humano a partir das juntas: tronco, pescoço, braços e pernas afunilados, cabeça e sapatos. */
function person(p: Person): Pick<SportShape, "limbs" | "dots"> {
  const limbs: Limb[] = [[p.sh[0], p.sh[1], 8, p.hip[0], p.hip[1], 6.6], [p.head[0], p.head[1], 3.2, p.sh[0], p.sh[1], 4]];
  const dots: Dot[] = [[p.head[0], p.head[1], HEAD_R]];
  for (const [el, ha] of p.arms) {
    limbs.push([p.sh[0], p.sh[1], 4.6, el[0], el[1], 3.7], [el[0], el[1], 3.7, ha[0], ha[1], 3.1]);
    dots.push([ha[0], ha[1], p.hand ?? 3.6]);
  }
  for (const [kn, ft, toe] of p.legs) {
    limbs.push([p.hip[0], p.hip[1], 6.4, kn[0], kn[1], 4.8], [kn[0], kn[1], 4.8, ft[0], ft[1], 3.4], [ft[0], ft[1], 3.4, toe[0], toe[1], 2.8]);
  }
  return { limbs, dots };
}

const join = (...parts: Partial<SportShape>[]): SportShape => ({
  limbs: parts.flatMap((x) => x.limbs ?? []),
  dots: parts.flatMap((x) => x.dots ?? []),
  rings: parts.flatMap((x) => x.rings ?? []),
  floor: parts.find((x) => x.floor)?.floor ?? [-30, 30],
});

const FLOOR_Y = 0;

export const SPORTS = {
  futebol: join(
    person({ head: [-8, 93], sh: [-6, 80], hip: [-1, 52], arms: [[[-22, 74], [-35, 82]], [[8, 72], [20, 64]]], legs: [[[-3, 28], [-4, 3], [4, 3]], [[16, 42], [35, 36], [41, 38]]] }),
    { dots: [[50, 40, 8]], floor: [-16, 12] },
  ),
  basquete: join(
    person({ head: [2, 93], sh: [0, 80], hip: [-2, 52], arms: [[[14, 86], [14, 106]], [[6, 88], [10, 103]]], legs: [[[4, 30], [2, 3], [10, 3]], [[-6, 29], [-10, 3], [-2, 3]]] }),
    { dots: [[13, 116, 9]], floor: [-18, 18] },
  ),
  volei: join(
    person({ head: [0, 93], sh: [0, 80], hip: [0, 52], arms: [[[-11, 90], [-6, 106]], [[11, 90], [6, 106]]], legs: [[[8, 30], [10, 3], [18, 3]], [[-8, 30], [-12, 3], [-4, 3]]] }),
    { dots: [[0, 114, 9]], floor: [-20, 24] },
  ),
  tenis: join(
    person({ head: [-2, 93], sh: [-4, 80], hip: [-2, 52], arms: [[[8, 76], [24, 72]], [[-18, 78], [-30, 88]]], legs: [[[-14, 28], [-22, 3], [-14, 3]], [[12, 30], [20, 3], [28, 3]]] }),
    { limbs: [[24, 72, 1.8, 38, 91, 1.6]], rings: [[44, 98, 11.5, 8]], floor: [-28, 34] },
  ),
  natacao: join(
    {
      limbs: [
        [-28, 20, 8, 0, 16, 6.6], [-40, 22, 3.2, -28, 20, 4],
        [0, 16, 6.4, 22, 15, 4.8], [22, 15, 4.8, 42, 17, 3.4], [42, 17, 3.4, 49, 19, 2.8],
        [0, 16, 6, 22, 20, 4.6], [22, 20, 4.6, 42, 24, 3.4], [42, 24, 3.4, 49, 27, 2.8],
        [-28, 20, 4.6, -38, 36, 3.7], [-38, 36, 3.7, -52, 30, 3.1],
        [-28, 20, 4.6, -20, 12, 3.7], [-20, 12, 3.7, -6, 10, 3.1],
      ],
      dots: [[-40, 22, HEAD_R], [-52, 30, 3.6], ...Array.from({ length: 15 }, (_, i): Dot => [-56 + i * 8, 7, 5])],
      floor: [-58, 58],
    },
  ),
  corrida: join(
    person({ head: [10, 92], sh: [6, 80], hip: [-2, 53], arms: [[[18, 76], [22, 92]], [[-10, 74], [-20, 64]]], legs: [[[20, 56], [12, 36], [20, 34]], [[-12, 30], [-26, 6], [-18, 2]]] }),
    { floor: [-30, -10] },
  ),
  ciclismo: join(
    person({ head: [22, 82], sh: [14, 72], hip: [-6, 54], arms: [[[20, 64], [23, 54]]], legs: [[[8, 42], [5, 26], [12, 26]]] }),
    {
      limbs: [[-28, 18, 1.8, 2, 22, 2.2], [2, 22, 2.2, -6, 50, 2], [-6, 50, 2, 20, 50, 2], [2, 22, 2.2, 20, 50, 2.2], [20, 50, 2.2, 28, 18, 1.8], [20, 50, 2.2, 23, 56, 1.6], [-9, 51, 1.8, -3, 51, 3]],
      rings: [[-28, 18, 18, 15], [28, 18, 18, 15]],
      floor: [-28, 28],
    },
  ),
  ginastica: join(
    person({ head: [16, 88], sh: [10, 78], hip: [0, 52], arms: [[[24, 86], [40, 96]], [[-8, 84], [-18, 92]]], legs: [[[0, 28], [0, 3], [8, 3]], [[-20, 60], [-42, 70], [-48, 72]]] }),
    { floor: [-8, 14] },
  ),
  handebol: join(
    person({ head: [2, 93], sh: [0, 80], hip: [-2, 52], arms: [[[-16, 92], [-10, 104]], [[14, 82], [30, 86]]], legs: [[[12, 32], [16, 3], [24, 3]], [[-14, 30], [-24, 3], [-16, 3]]] }),
    { dots: [[-10, 114, 7.5]], floor: [-26, 26] },
  ),
  beisebol: join(
    person({ head: [-2, 93], sh: [-2, 80], hip: [0, 52], arms: [[[-14, 84], [-14, 97]], [[-4, 88], [-10, 98]]], legs: [[[-12, 28], [-16, 3], [-8, 3]], [[12, 28], [18, 3], [26, 3]]] }),
    { limbs: [[-12, 97, 1.8, -34, 128, 3.6]], floor: [-18, 28] },
  ),
  boxe: join(
    person({ head: [4, 92], sh: [0, 80], hip: [-4, 52], arms: [[[18, 78], [34, 86]], [[8, 70], [16, 85]]], legs: [[[10, 30], [14, 3], [22, 3]], [[-10, 30], [-18, 3], [-10, 3]]], hand: 6.8 }),
    { floor: [-20, 24] },
  ),
  skate: join(
    person({ head: [0, 91], sh: [-2, 78], hip: [0, 52], arms: [[[-22, 70], [-38, 66]], [[18, 72], [34, 80]]], legs: [[[-10, 32], [-14, 13], [-8, 13]], [[10, 32], [14, 13], [20, 13]]] }),
    { limbs: [[-28, 10, 1.9, 28, 10, 1.9]], dots: [[-20, 4.5, 4.5], [20, 4.5, 4.5]], floor: [-26, 26] },
  ),
  halterofilismo: join(
    person({ head: [0, 92], sh: [0, 80], hip: [0, 52], arms: [[[-14, 100], [-20, 116]], [[14, 100], [20, 116]]], legs: [[[-12, 28], [-18, 3], [-10, 3]], [[12, 28], [18, 3], [26, 3]]] }),
    { limbs: [[-40, 116, 1.8, 40, 116, 1.8]], dots: [[-31, 116, 11], [31, 116, 11], [-25, 116, 8.5], [25, 116, 8.5]], floor: [-20, 28] },
  ),
  taekwondo: join(
    person({ head: [-14, 91], sh: [-10, 78], hip: [0, 52], arms: [[[-22, 70], [-30, 82]], [[-6, 66], [10, 76]]], legs: [[[0, 28], [0, 3], [8, 3]], [[18, 58], [40, 66], [46, 67]]] }),
    { floor: [-6, 14] },
  ),
  golfe: join(
    person({ head: [0, 92], sh: [-2, 80], hip: [2, 52], arms: [[[14, 86], [8, 100]], [[8, 84], [8, 99]]], legs: [[[2, 28], [0, 3], [8, 3]], [[-10, 28], [-10, 3], [-3, 3]]] }),
    { limbs: [[8, 100, 1.3, -34, 74, 1.3]], dots: [[-36, 72, 3.6]], floor: [-14, 14] },
  ),
} satisfies Record<string, SportShape>;

export type SportId = keyof typeof SPORTS;
export const SPORT_IDS = Object.keys(SPORTS) as SportId[];

export const SPORT_LABELS: Record<SportId, string> = {
  futebol: "Futebol",
  basquete: "Basquete",
  volei: "Vôlei",
  tenis: "Tênis",
  natacao: "Natação",
  corrida: "Corrida",
  ciclismo: "Ciclismo",
  ginastica: "Ginástica",
  handebol: "Handebol",
  beisebol: "Beisebol",
  boxe: "Boxe",
  skate: "Skate",
  halterofilismo: "Halterofilismo",
  taekwondo: "Taekwondo",
  golfe: "Golfe",
};

const SEG = 24;

/**
 * Região 2D da silhueta, com a maior dimensão (altura ou largura) em `size` mm, os pés em y = 0 e centrada em x pelo
 * chão. Quem chama dá delete().
 */
export function sportSilhouette(M: ManifoldToplevel, id: SportId, size: number): CS {
  const s = SPORTS[id];
  return scoped((k) => {
    const circle = (x: number, y: number, r: number) => k(k(M.CrossSection.circle(r, SEG)).translate([x, y]));
    const parts: CS[] = [];
    for (const [x1, y1, r1, x2, y2, r2] of s.limbs) parts.push(k(M.CrossSection.hull([circle(x1, y1, r1), circle(x2, y2, r2)])));
    for (const [x, y, r] of s.dots) parts.push(circle(x, y, r));
    for (const [x, y, R, r] of s.rings) parts.push(k(circle(x, y, R).subtract(circle(x, y, r))));
    parts.push(k(M.CrossSection.hull([circle(s.floor[0], FLOOR_Y, 2.6), circle(s.floor[1], FLOOR_Y, 2.6)])));
    const all = k(M.CrossSection.union(parts));
    const b = all.bounds();
    const scale = size / Math.max(b.max[1] - FLOOR_Y, b.max[0] - b.min[0]);
    // pés (y = 0) embaixo, o meio do chão no x = 0
    return k(all.translate([-(s.floor[0] + s.floor[1]) / 2, 0])).scale([scale, scale]); // o resultado final não entra no k: quem chama é dono
  });
}
