import type { ToolOutline } from "../../organizer/types";

/**
 * Arrumação das ferramentas do Organizador pela foto (#169), em 2D puro (mm): cada ferramenta deita no menor
 * retângulo que a contém (lado comprido em X) e as caixas vão em prateleiras, da mais alta para a mais baixa.
 * ponytail: prateleiras por retângulo, não encaixe de contorno; trocar por nesting de polígonos se sobrar muito vão.
 */
type Pt = [number, number];
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function boundsOf(points: Pt[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/** Casco convexo (cadeia monótona), anti-horário. */
function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

const rotate = (points: Pt[], a: number): Pt[] => {
  const c = Math.cos(a), s = Math.sin(a);
  return points.map(([x, y]) => [x * c - y * s, x * s + y * c]);
};
const move = (points: Pt[], dx: number, dy: number): Pt[] => points.map(([x, y]) => [x + dx, y + dy]);

/** Gira e move a ferramenta inteira (contorno e furos). */
export function transform(o: ToolOutline, angle: number, dx = 0, dy = 0): ToolOutline {
  const t = (pts: Pt[]) => move(rotate(pts, angle), dx, dy);
  return { ...o, points: t(o.points), ...(o.holes ? { holes: o.holes.map(t) } : {}) };
}

/** Ângulo que deita a ferramenta no retângulo de menor área (calipers rotativos sobre o casco). */
function bestAngle(points: Pt[]): number {
  const h = hull(points);
  let best = { area: Infinity, angle: 0 };
  for (let i = 0; i < h.length; i++) {
    const [a, b] = [h[i], h[(i + 1) % h.length]];
    const angle = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    const r = boundsOf(rotate(h, angle));
    const w = r.maxX - r.minX, d = r.maxY - r.minY;
    const area = w * d;
    if (area < best.area - 1e-9) best = { area, angle: w >= d ? angle : angle + Math.PI / 2 };
  }
  return best.angle;
}

/** Ferramenta deitada no menor retângulo, lado comprido em X, com o canto em (0, 0). */
export function orient(o: ToolOutline): ToolOutline {
  const turned = transform(o, bestAngle(o.points));
  const b = boundsOf(turned.points);
  return transform(turned, 0, -b.minX, -b.minY);
}

export type ArrangeOptions = {
  /** Largura útil da área (mm). */
  width: number;
  /** Profundidade útil (mm); sem ela a área cresce o quanto precisar. */
  height?: number;
  /** Quanto o bolsão cresce em volta da ferramenta (folga). */
  inflate: number;
  /** Parede entre bolsões e até a borda. */
  gap: number;
  /** Espaço a mais em cima de cada ferramenta (o recorte do dedo sai para lá). */
  reserveTop?: number;
};
/** `size`: a área (com `height`, a área inteira); `used`: só o que as ferramentas ocupam, com a parede em volta. */
export type Arranged = { placed: ToolOutline[]; size: [number, number]; used: [number, number]; missing: string[] };

/** Prateleiras: cada ferramenta já deitada; se não couber na largura, tenta em pé (90°). */
export function arrange(outlines: ToolOutline[], o: ArrangeOptions): Arranged {
  const pad = o.inflate;
  const items = outlines.map(orient).map((t) => {
    const b = boundsOf(t.points);
    return { t, w: b.maxX + 2 * pad, h: b.maxY + 2 * pad + (o.reserveTop ?? 0) };
  });
  const fitsWidth = (w: number) => o.gap + w + o.gap <= o.width + 1e-9;
  const ready = items.map((it) => {
    if (fitsWidth(it.w) || !fitsWidth(it.h)) return it;
    const t = transform(it.t, Math.PI / 2); // em pé e de volta ao canto
    const b = boundsOf(t.points);
    const top = o.reserveTop ?? 0;
    return { t: transform(t, 0, -b.minX, -b.minY), w: it.h - top, h: it.w + top };
  });
  ready.sort((a, b) => b.h - a.h || b.w - a.w);
  const placed: ToolOutline[] = [];
  const missing: string[] = [];
  let x = o.gap, y = o.gap, shelf = 0, used = 0;
  for (const it of ready) {
    if (!fitsWidth(it.w)) {
      missing.push(it.t.id);
      continue;
    }
    if (x + it.w + o.gap > o.width + 1e-9) {
      y += shelf + o.gap;
      x = o.gap;
      shelf = 0;
    }
    if (o.height !== undefined && y + it.h + o.gap > o.height + 1e-9) {
      missing.push(it.t.id);
      continue;
    }
    placed.push(transform(it.t, 0, x + pad, y + pad));
    x += it.w + o.gap;
    shelf = Math.max(shelf, it.h);
    used = Math.max(used, x);
  }
  const depth = placed.length ? y + shelf + o.gap : 0;
  return { placed, size: [o.height === undefined ? used : o.width, o.height ?? depth], used: [used, depth], missing };
}
