import { strToU8, zipSync } from "fflate";

const V: [number, number, number][] = [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0], [0, 0, 20], [20, 0, 20], [20, 20, 20], [0, 20, 20]];
/** Faces do cubo (2 triângulos cada), de fora: baixo, cima, frente (y = 0), trás, esquerda, direita. */
const FACES: [string, number[][]][] = [
  ["baixo", [[0, 2, 1], [0, 3, 2]]],
  ["cima", [[4, 5, 6], [4, 6, 7]]],
  ["frente", [[0, 1, 5], [0, 5, 4]]],
  ["tras", [[2, 3, 7], [2, 7, 6]]],
  ["esq", [[3, 0, 4], [3, 4, 7]]],
  ["dir", [[1, 2, 6], [1, 6, 5]]],
];
/** Índices do grupo de cores: cinza, vermelho, azul, vermelho quase igual. */
export const CUBE_COLORS = ["#c8c8c8", "#ff0000", "#0000ff", "#f01010"];

/** 3MF de um cubo de 20 mm que pinta por material (colorgroup): cada face escolhe o índice da cor (ou um por triângulo). */
export function colorCube3mf(color: Record<string, number | number[]>): Uint8Array {
  const pick = (n: string, i: number) => {
    const c = color[n] ?? 0;
    return Array.isArray(c) ? c[i] : c;
  };
  const tris = FACES.flatMap(([n, ts]) => ts.map((t, i) => `<triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}" pid="2" p1="${pick(n, i)}"/>`)).join("");
  const verts = V.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("");
  const group = CUBE_COLORS.map((c) => `<m:color color="${c.toUpperCase()}FF"/>`).join("");
  const model = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"><resources><m:colorgroup id="2">${group}</m:colorgroup><object id="1" type="model" name="Cubo"><mesh><vertices>${verts}</vertices><triangles>${tris}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  return zipSync({ "3D/3dmodel.model": strToU8(model) });
}

/** 3MF que pinta por material de uma malha qualquer: `pick` escolhe o índice da cor (de `palette`) pelo centro de cada triângulo. */
export function colorMesh3mf(mesh: { positions: Float32Array; indices: Uint32Array }, palette: string[], pick: (c: [number, number, number]) => number): Uint8Array {
  const { positions: p, indices: ix } = mesh;
  const verts: string[] = [];
  for (let i = 0; i < p.length; i += 3) verts.push(`<vertex x="${p[i]}" y="${p[i + 1]}" z="${p[i + 2]}"/>`);
  const tris: string[] = [];
  for (let t = 0; t < ix.length; t += 3) {
    const c = [0, 1, 2].map((k) => (p[ix[t] * 3 + k] + p[ix[t + 1] * 3 + k] + p[ix[t + 2] * 3 + k]) / 3) as [number, number, number];
    tris.push(`<triangle v1="${ix[t]}" v2="${ix[t + 1]}" v3="${ix[t + 2]}" pid="2" p1="${pick(c)}"/>`);
  }
  const group = palette.map((c) => `<m:color color="${c.toUpperCase()}FF"/>`).join("");
  const model = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"><resources><m:colorgroup id="2">${group}</m:colorgroup><object id="1" type="model" name="Peça colorida"><mesh><vertices>${verts.join("")}</vertices><triangles>${tris.join("")}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  return zipSync({ "3D/3dmodel.model": strToU8(model) });
}
