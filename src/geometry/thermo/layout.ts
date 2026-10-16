import { modelsBounds } from "../bounds";
import type { Model } from "../types";

const shiftModel = (m: Model, dx: number, dy: number): Model => ({
  ...m,
  parts: m.parts.map((q) => ({ ...q, mesh: { ...q.mesh, positions: q.mesh.positions.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v)) } })),
});

const centered = (m: Model): Model => {
  const b = modelsBounds([m]);
  return b ? shiftModel(m, -(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2) : m;
};

/** Cada linha é uma fileira de peças lado a lado; as fileiras ficam uma abaixo da outra, tudo centrado no eixo X (a mesa do arquivo). */
export function layoutRows(rows: Model[][], gap: number): Model[] {
  const sized = rows.filter((r) => r.length).map((r) => r.map(centered));
  const dims = sized.map((r) => ({ w: r.reduce((s, m, i) => s + (modelsBounds([m])!.max[0] - modelsBounds([m])!.min[0]) + (i ? gap : 0), 0), h: Math.max(...r.map((m) => modelsBounds([m])!.max[1] - modelsBounds([m])!.min[1])) }));
  const out: Model[] = [];
  let y = 0;
  sized.forEach((row, ri) => {
    const cy = -(y + dims[ri].h / 2);
    let x = -dims[ri].w / 2;
    for (const m of row) {
      const w = modelsBounds([m])!.max[0] - modelsBounds([m])!.min[0];
      out.push(shiftModel(m, x + w / 2, cy));
      x += w + gap;
    }
    y += dims[ri].h + gap;
  });
  return out;
}

/** Grupos de arquivos lado a lado na mesa da prévia (cada grupo já vem centrado em X = 0). */
export function layoutGroups(groups: Model[][], gap: number): Model[] {
  const sizes = groups.map((g) => modelsBounds(g)).map((b) => (b ? b.max[0] - b.min[0] : 0));
  const total = sizes.reduce((s, w) => s + w, 0) + gap * Math.max(0, groups.length - 1);
  let x = -total / 2;
  return groups.flatMap((g, i) => {
    const b = modelsBounds(g);
    const here = x + sizes[i] / 2 - (b ? (b.min[0] + b.max[0]) / 2 : 0);
    x += sizes[i] + gap;
    return g.map((m) => shiftModel(m, here, 0));
  });
}
