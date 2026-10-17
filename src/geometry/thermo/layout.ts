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

export type Plate = { label: string; models: Model[] };
const PLATE_GAP = 20;
const PLATE_LINE_PX = 2;
const PLATE_COLOR = "#64748b";

/**
 * Mesa da prévia: cada arquivo (cada filamento e altura de camada) numa placa do tamanho da mesa da impressora, lado a lado,
 * com o contorno e o nome na legenda ("Placa 1 · PLA 0,20 mm"). Nenhuma peça fica fora de uma mesa; se uma placa passa da
 * mesa, o aviso de mesa já diz (o contorno só mostra de quanto).
 */
export function layoutPlates(plates: Plate[], bed: number, gap = PLATE_GAP): Model[] {
  return plates.flatMap((pl, i) => {
    const cx = i * (bed + gap);
    const b = modelsBounds(pl.models);
    const dx = cx - (b ? (b.min[0] + b.max[0]) / 2 : 0);
    const dy = -(b ? (b.min[1] + b.max[1]) / 2 : 0);
    const h = bed / 2;
    const [x0, x1, y0, y1] = [cx - h, cx + h, -h, h];
    const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const points = Float32Array.from(c.flatMap((p, k) => [p[0], p[1], 0.05, c[(k + 1) % 4][0], c[(k + 1) % 4][1], 0.05]));
    const outline: Model = { name: `Placa ${i + 1}`, parts: [{ name: `Placa ${i + 1} · ${pl.label}`, color: PLATE_COLOR, mesh: { positions: new Float32Array(0), indices: new Uint32Array(0) }, lines: { points, width: PLATE_LINE_PX, dash: 0 } }] };
    return [outline, ...pl.models.map((m) => shiftModel(m, dx, dy))];
  });
}
