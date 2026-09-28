import type { Model } from "./types";

/** STL binário com todas as partes de todos os objetos (STL não guarda cor). */
export function writeStl(models: Model[]): Uint8Array {
  const meshes = models.flatMap((m) => m.parts.map((p) => p.mesh));
  const tris = meshes.reduce((s, m) => s + m.indices.length / 3, 0);
  const buf = new ArrayBuffer(84 + tris * 50);
  const v = new DataView(buf);
  new TextEncoder().encodeInto("UpVision Maker", new Uint8Array(buf, 0, 80));
  v.setUint32(80, tris, true);
  let o = 84;
  for (const { positions: p, indices: ix } of meshes) {
    for (let t = 0; t < ix.length; t += 3) {
      const [a, b, c] = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3];
      const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
      const w = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      const floats = [n[0] / len, n[1] / len, n[2] / len];
      for (const i of [a, b, c]) floats.push(p[i], p[i + 1], p[i + 2]);
      for (const f of floats) {
        v.setFloat32(o, f, true);
        o += 4;
      }
      o += 2; // atributo
    }
  }
  return new Uint8Array(buf);
}
