/**
 * Peças para montar atletas (#223): membros (cápsulas afuniladas entre duas bolinhas), bolinhas e anéis, com o chão em
 * y = 0 e o atleta de pé com ~100 de altura. `person` monta o corpo a partir das juntas.
 */
export type V = [number, number];
/** x1, y1, r1, x2, y2, r2: cápsula afunilada. */
export type Limb = [number, number, number, number, number, number];
export type Dot = [number, number, number];
export type Ring = [number, number, number, number]; // x, y, raio de fora, raio de dentro

export type SportShape = { limbs: Limb[]; dots: Dot[]; rings: Ring[]; floor: [number, number] };

export type Person = {
  head: V;
  sh: V;
  hip: V;
  arms: [V, V][]; // cotovelo, mão
  legs: [V, V, V][]; // joelho, tornozelo, ponta do pé
  hand?: number; // raio da mão (luva maior no boxe)
  front?: number; // meia largura dos ombros de frente (0 = de perfil)
};

export const HEAD_R = 8.2;

export const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Cadeia de círculos: uma cápsula afunilada entre cada par (dá o volume de músculo ao braço e à perna). */
export const chain = (...c: Dot[]): Limb[] => c.slice(1).map((d, i) => [c[i][0], c[i][1], c[i][2], d[0], d[1], d[2]]);

/** Corpo humano estilo pictograma: tronco com ombros e quadris, braços e pernas com músculo, cabeça e sapatos. */
export function person(p: Person): Pick<SportShape, "limbs" | "dots"> {
  const dx = p.hip[0] - p.sh[0];
  const dy = p.hip[1] - p.sh[1];
  const len = Math.hypot(dx, dy) || 1;
  const n: V = [-dy / len, dx / len]; // perpendicular ao tronco
  const sw = p.front ?? 0;
  const shoulder = (i: number): V => [p.sh[0] + n[0] * sw * (i === 0 ? 1 : -1), p.sh[1] + n[1] * sw * (i === 0 ? 1 : -1)];
  const hipAt = (i: number): V => [p.hip[0] + n[0] * sw * 0.55 * (i === 0 ? 1 : -1), p.hip[1] + n[1] * sw * 0.55 * (i === 0 ? 1 : -1)];
  const limbs: Limb[] = [
    ...chain([p.sh[0] + n[0] * sw, p.sh[1] + n[1] * sw, 6.4], [p.hip[0] + n[0] * sw * 0.55, p.hip[1] + n[1] * sw * 0.55, 6.8]),
    ...chain([p.sh[0] - n[0] * sw, p.sh[1] - n[1] * sw, 6.4], [p.hip[0] - n[0] * sw * 0.55, p.hip[1] - n[1] * sw * 0.55, 6.8]),
    ...chain([p.sh[0], p.sh[1], 8.4], [p.hip[0], p.hip[1], 7.2]),
    ...chain([p.head[0], p.head[1], 3.8], [p.sh[0], p.sh[1], 5.4]),
  ];
  const dots: Dot[] = [[p.head[0], p.head[1], HEAD_R]];
  p.arms.forEach(([el, ha], i) => {
    const s0 = shoulder(i % 2);
    limbs.push(...chain([s0[0], s0[1], 5.8], [el[0], el[1], 4.4]), ...chain([el[0], el[1], 4.4], [...lerp(el, ha, 0.3), 4.6], [ha[0], ha[1], 2.6]));
    dots.push([ha[0], ha[1], p.hand ?? 3.2]);
  });
  p.legs.forEach(([kn, ft, toe], i) => {
    const h0 = hipAt(i % 2);
    limbs.push(...chain([h0[0], h0[1], 8.6], [kn[0], kn[1], 6]), ...chain([kn[0], kn[1], 6], [...lerp(kn, ft, 0.3), 6.6], [ft[0], ft[1], 3.2]), ...chain([ft[0], ft[1], 3.2], [toe[0], toe[1], 2.8]));
  });
  return { limbs, dots };
}

export const join = (...parts: Partial<SportShape>[]): SportShape => ({
  limbs: parts.flatMap((x) => x.limbs ?? []),
  dots: parts.flatMap((x) => x.dots ?? []),
  rings: parts.flatMap((x) => x.rings ?? []),
  floor: parts.find((x) => x.floor)?.floor ?? [-30, 30],
});

