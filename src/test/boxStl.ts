/** STL binário de um bloco w × d × h com o canto em (0, 0, 0): 12 triângulos, normais para fora. */
export function boxStl(w: number, d: number, h: number): Uint8Array<ArrayBuffer> {
  const v = (x: number, y: number, z: number): [number, number, number] => [x * w, y * d, z * h];
  const quads: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]][] = [
    [v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)], // baixo (z = 0)
    [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)], // cima
    [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)], // frente (y = 0)
    [v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)], // trás
    [v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)], // esquerda (x = 0)
    [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)], // direita
  ];
  const buf = new ArrayBuffer(84 + quads.length * 2 * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, quads.length * 2, true);
  let o = 84;
  for (const [a, b, c, e] of quads)
    for (const tri of [[a, b, c], [a, c, e]]) {
      o += 12; // normal (zero: o app recalcula pela malha)
      for (const p of tri) for (const x of p) { dv.setFloat32(o, x, true); o += 4; }
      o += 2;
    }
  return new Uint8Array(buf);
}
