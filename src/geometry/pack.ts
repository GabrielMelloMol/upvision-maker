import { modelsBounds } from "./bounds";
import { moveModel } from "./models/common";
import type { Model } from "./types";

/**
 * Empacota modelos em mesas quadradas de `bed` mm por prateleiras: do maior para o menor, enche a linha da esquerda
 * para a direita e abre outra linha (ou outra mesa) quando não cabe. Cada modelo sai movido para dentro da sua mesa
 * (canto em [gap, gap]). Modelo maior que a mesa fica sozinho numa mesa.
 * ponytail: prateleiras simples (sem girar peça); troque por skyline/maxrects se sobrar muito espaço.
 */
export function packPlates(models: Model[], bed: number, gap: number): Model[][] {
  const items = models
    .map((m) => ({ m, b: modelsBounds([m])! }))
    .filter((x) => x.b)
    .map((x) => ({ ...x, w: x.b.max[0] - x.b.min[0], d: x.b.max[1] - x.b.min[1] }))
    .sort((a, b) => Math.max(b.w, b.d) - Math.max(a.w, a.d) || b.d - a.d);
  const plates: { models: Model[]; x: number; y: number; row: number }[] = [];
  const place = (p: (typeof plates)[number], it: (typeof items)[number]) => {
    p.models.push(moveModel(it.m, p.x - it.b.min[0], p.y - it.b.min[1]));
    p.x += it.w + gap;
    p.row = Math.max(p.row, it.d);
  };
  for (const it of items) {
    if (it.w > bed - 2 * gap || it.d > bed - 2 * gap) {
      plates.push({ models: [moveModel(it.m, -it.b.min[0], -it.b.min[1])], x: bed, y: bed, row: 0 });
      continue;
    }
    let done = false;
    for (const p of plates) {
      if (p.x + it.w <= bed - gap && p.y + it.d <= bed - gap) {
        place(p, it);
        done = true;
        break;
      }
      // nova linha na mesma mesa
      const y = p.y + p.row + gap;
      if (y + it.d <= bed - gap && gap + it.w <= bed - gap) {
        p.x = gap;
        p.y = y;
        p.row = 0;
        place(p, it);
        done = true;
        break;
      }
    }
    if (!done) {
      const p = { models: [], x: gap, y: gap, row: 0 };
      plates.push(p);
      place(p, it);
    }
  }
  return plates.map((p) => p.models);
}
