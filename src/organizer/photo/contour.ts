import type { Pt } from "./homography";

/** Região rotulada: `labels[i] === id` são os pixels dela; caixa [x0, y0, x1, y1] (inclusiva) para não varrer tudo. */
export type Region = { labels: Int32Array; width: number; id: number; box: [number, number, number, number] };

/**
 * Laços da borda de uma região, nos cantos dos pixels (x, y em px, y para baixo). Cada pixel contribui os lados que
 * dão para fora, no sentido horário da tela; ao encadear, o laço de fora sai horário e os furos anti-horários.
 * Num canto em que só dois pixels na diagonal se tocam, vira para o lado que mantém os dois separados (4-vizinhança,
 * igual à rotulagem).
 */
export function regionLoops(r: Region): Pt[][] {
  const { labels, width, id, box } = r;
  const W = width + 1;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y * width + x < labels.length && labels[y * width + x] === id;
  const next = new Map<number, number[]>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = ay * W + ax;
    const list = next.get(k);
    if (list) list.push(by * W + bx);
    else next.set(k, [by * W + bx]);
  };
  for (let y = box[1]; y <= box[3]; y++)
    for (let x = box[0]; x <= box[2]; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  const loops: Pt[][] = [];
  for (const [start, outs] of next) {
    while (outs.length) {
      const loop: Pt[] = [];
      let prev = start;
      let cur = outs.pop()!;
      loop.push([start % W, Math.floor(start / W)]);
      while (cur !== start) {
        loop.push([cur % W, Math.floor(cur / W)]);
        const options = next.get(cur)!;
        let pick = options.length - 1;
        if (options.length > 1) {
          const dx = (cur % W) - (prev % W);
          const dy = Math.floor(cur / W) - Math.floor(prev / W);
          pick = options.findIndex((o) => dx * (Math.floor(o / W) - Math.floor(cur / W)) - dy * ((o % W) - (cur % W)) > 0);
          if (pick < 0) pick = options.length - 1;
        }
        prev = cur;
        cur = options.splice(pick, 1)[0];
      }
      loops.push(loop);
    }
  }
  return loops.map(dropCollinear);
}

/** Tira os pontos do meio de trechos retos (a cadeia anda 1 px por vez). */
function dropCollinear(loop: Pt[]): Pt[] {
  return loop.filter((p, i) => {
    const a = loop[(i + loop.length - 1) % loop.length];
    const b = loop[(i + 1) % loop.length];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
}

/** Área com sinal (positiva = anti-horário com y para cima). */
export function signedArea(loop: Pt[]): number {
  let s = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[(i + 1) % loop.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function dp(pts: Pt[], tol: number): Pt[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let far = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b]);
      if (d > far) [far, at] = [d, i];
    }
    if (far > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Douglas-Peucker num laço fechado: corta no ponto mais longe do primeiro para não perder o canto inicial. */
export function simplifyLoop(loop: Pt[], tol: number): Pt[] {
  if (loop.length <= 4) return loop;
  let far = 0;
  loop.forEach((p, i) => {
    if (Math.hypot(p[0] - loop[0][0], p[1] - loop[0][1]) > Math.hypot(loop[far][0] - loop[0][0], loop[far][1] - loop[0][1])) far = i;
  });
  const first = dp(loop.slice(0, far + 1), tol);
  const second = dp([...loop.slice(far), loop[0]], tol);
  return [...first, ...second.slice(1, -1)];
}
