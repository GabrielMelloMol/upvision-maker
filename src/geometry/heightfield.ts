import type { Mesh } from "./types";

export type Vec3 = [number, number, number];

/**
 * Sólido fechado de um campo de alturas: grade `cols × rows` com espessura `t[i]` (mm) sobre um fundo em 0.
 * Pontos em (x, y) = (coluna, linha) × `cell` mm, linha 0 em cima (y maior). `map` curva/gira o sólido
 * (recebe x, y e a profundidade z ∈ [0, t]); qualquer mapa contínuo mantém a malha fechada.
 */
export function heightfieldMesh(t: Float32Array, cols: number, rows: number, cell: number, map: (x: number, y: number, z: number) => Vec3 = (x, y, z) => [x, y, z]): Mesh {
  if (cols < 2 || rows < 2) throw new Error("Imagem pequena demais.");
  const n = cols * rows;
  const positions = new Float32Array(n * 2 * 3);
  const W = (cols - 1) * cell, H = (rows - 1) * cell;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = c * cell - W / 2, y = H / 2 - r * cell;
      positions.set(map(x, y, t[i]), i * 3);
      positions.set(map(x, y, 0), (n + i) * 3);
    }
  }
  const idx: number[] = [];
  const top = (r: number, c: number) => r * cols + c;
  const bot = (r: number, c: number) => n + r * cols + c;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const [a, b, d, e] = [top(r, c), top(r, c + 1), top(r + 1, c), top(r + 1, c + 1)];
      idx.push(a, d, b, b, d, e); // topo (normal +z com y para cima)
      const [A, B, D, E] = [bot(r, c), bot(r, c + 1), bot(r + 1, c), bot(r + 1, c + 1)];
      idx.push(A, B, D, B, E, D); // fundo (normal -z)
    }
  }
  // paredes: percorre a borda e liga topo e fundo
  const ring: [number, number][] = [];
  for (let c = 0; c < cols - 1; c++) ring.push([0, c]);
  for (let r = 0; r < rows - 1; r++) ring.push([r, cols - 1]);
  for (let c = cols - 1; c > 0; c--) ring.push([rows - 1, c]);
  for (let r = rows - 1; r > 0; r--) ring.push([r, 0]);
  for (let k = 0; k < ring.length; k++) {
    const [r0, c0] = ring[k], [r1, c1] = ring[(k + 1) % ring.length];
    const [a, b, A, B] = [top(r0, c0), top(r1, c1), bot(r0, c0), bot(r1, c1)];
    idx.push(a, b, A, b, B, A);
  }
  const mesh = { positions, indices: new Uint32Array(idx) };
  return signedVolume(mesh) < 0 ? flip(mesh) : mesh;
}

function signedVolume(m: Mesh): number {
  let v = 0;
  const p = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i] * 3, m.indices[i + 1] * 3, m.indices[i + 2] * 3];
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

/** Inverte a orientação dos triângulos (espelhar/curvar pode virar a malha do avesso). */
function flip(m: Mesh): Mesh {
  const idx = m.indices.slice();
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  return { positions: m.positions, indices: idx };
}

/** Luminância 0–1 (composta sobre branco) por pixel. */
export function lumaGrid(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const [r, g, b] = [0, 1, 2].map((c) => (rgba[i * 4 + c] * a + 255 * (1 - a)) / 255);
    out[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return out;
}
