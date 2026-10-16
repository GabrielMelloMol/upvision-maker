/** STL binário de um cilindro (maciço) de raio r e altura h, com a base em z = 0 e o eixo em Z: o corpo de um copo para os testes de tela. */
export function cylinderStl(r: number, h: number, segments = 96): Uint8Array<ArrayBuffer> {
  const tris: [number[], number[], number[]][] = [];
  const ring = (i: number, z: number) => [r * Math.cos((2 * Math.PI * (i % segments)) / segments), r * Math.sin((2 * Math.PI * (i % segments)) / segments), z]; // i % segments: o último vértice é o primeiro
  for (let i = 0; i < segments; i++) {
    const [a, b, c, d] = [ring(i, 0), ring(i + 1, 0), ring(i + 1, h), ring(i, h)];
    tris.push([a, b, c], [a, c, d]); // lateral, normais para fora
    tris.push([[0, 0, 0], b, a]); // base
    tris.push([[0, 0, h], d, c]); // topo
  }
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris.length, true);
  tris.forEach((t, n) => {
    let o = 84 + n * 50 + 12;
    for (const p of t)
      for (const v of p) {
        dv.setFloat32(o, v, true);
        o += 4;
      }
  });
  return new Uint8Array(buf);
}
