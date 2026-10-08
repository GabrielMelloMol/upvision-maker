import { heightfieldMesh } from "./heightfield";
import { lithoThickness } from "./lithophane";
import type { ManifoldToplevel, Solid } from "./manifold";
import { toMesh } from "./mesh";
import { scoped } from "./shape2d";
import type { Mesh } from "./types";

/*
 * Litofania em forma de coração ou círculo (#101): o campo de alturas retangular da foto, cortado pelo contorno, com a
 * moldura acompanhando a forma, em pé, com pé na mesa ou com a lingueta que encaixa na base de LED.
 */
export type CutShape = "heart" | "circle";

const HEART_RATIO = 0.905; // altura ÷ largura do coração
const FOOT_D = 14; // profundidade do pé (sem base)
const FOOT_H = 3;
const FOOT_SINK = 1.5; // quanto a forma afunda no pé
const PLUG_OVERLAP = 6; // quanto a lingueta entra na forma, para ficar presa nela
const SEGMENTS = 128;

type Pt = [number, number];

/** Largura e altura da peça: círculo é redondo, o coração tem a altura na proporção. */
export function shapeSize(shape: CutShape, width: number): { w: number; h: number } {
  return { w: width, h: shape === "circle" ? width : Math.round(width * HEART_RATIO * 100) / 100 };
}

/** Contorno anti-horário, centrado na origem, ocupando exatamente `width` × `height`. */
export function shapeOutline(shape: CutShape, width: number, height = shapeSize(shape, width).h): Pt[] {
  if (shape === "circle") return Array.from({ length: SEGMENTS }, (_, i) => [(width / 2) * Math.cos((2 * Math.PI * i) / SEGMENTS), (height / 2) * Math.sin((2 * Math.PI * i) / SEGMENTS)]);
  // curva clássica do coração; normalizada para a largura e a altura pedidas
  const raw: Pt[] = Array.from({ length: SEGMENTS }, (_, i) => {
    const t = (2 * Math.PI * i) / SEGMENTS;
    return [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)];
  });
  const xs = raw.map((p) => p[0]), ys = raw.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pts = raw.map(([x, y]): Pt => [((x - (x0 + x1) / 2) / (x1 - x0)) * width, ((y - (y0 + y1) / 2) / (y1 - y0)) * height]);
  const area = pts.reduce((s, [x, y], i) => s + (x * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * y), 0);
  return area < 0 ? pts.reverse() : pts;
}

export type ShapedParams = {
  shape: CutShape;
  minT: number;
  maxT: number;
  /** Moldura cheia que segue o contorno (mm). */
  border: number;
  /** Lingueta para o encaixe da base de LED; sem ela, a peça leva um pé. */
  plug: { width: number; depth: number } | null;
};

/**
 * Peça em pé (espessura em Y, altura em Z), de z = 0 até o topo. `centerZ` é a altura do centro da forma (para cortes
 * de conferência).
 */
export function buildShapedPanel(M: ManifoldToplevel, luma: Float32Array, cols: number, rows: number, cell: number, p: ShapedParams): { mesh: Mesh; centerZ: number } {
  if (!(p.maxT > p.minT)) throw new Error("A espessura máxima precisa ser maior que a mínima.");
  const W = (cols - 1) * cell, H = (rows - 1) * cell;
  const lift = p.plug ? p.plug.depth : FOOT_H - FOOT_SINK; // altura da base da forma
  return scoped((k) => {
    const t = lithoThickness(luma, cols, rows, cell, { minT: p.minT, maxT: p.maxT, border: 0 });
    const field = heightfieldMesh(t, cols, rows, cell, (x, y, z) => [x, z, y + H / 2 + lift]);
    const hf = k(M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: field.positions, triVerts: field.indices })));
    // contorno (x, y da foto) → em pé: espessura em Y, altura em Z (o Y da foto vira Z, de cabeça para cima)
    const cs = k(new M.CrossSection([shapeOutline(p.shape, W, H).map(([x, y]): Pt => [x, -y])], "NonZero"));
    const stand = (c: { extrude(h: number): Solid }, h: number) => k(k(k(c.extrude(h)).rotate([-90, 0, 0])).translate([0, 0, H / 2 + lift]));
    const cut = stand(cs, p.maxT);
    let body = k(hf.intersect(cut));
    if (p.border > 0) {
      const ring = k(cs.subtract(k(cs.offset(-p.border, "Round"))));
      body = k(body.add(stand(ring, p.maxT)));
    }
    if (p.plug) {
      const plug = k(k(M.Manifold.cube([p.plug.width, p.maxT, p.plug.depth + PLUG_OVERLAP])).translate([-p.plug.width / 2, 0, 0]));
      body = k(body.add(plug));
    } else {
      const foot = k(k(M.Manifold.cube([W / 2, FOOT_D, FOOT_H])).translate([-W / 4, p.maxT / 2 - FOOT_D / 2, 0]));
      body = k(body.add(foot));
    }
    return { mesh: toMesh(body), centerZ: H / 2 + lift };
  });
}

/** Distância de um ponto a um segmento. */
function distToSegment(px: number, py: number, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax, dy = by - ay;
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Prévia contra a luz com a forma: fora do contorno fica transparente e a faixa de `border` mm junto dele (a moldura)
 * fica escura. `img` é a RGBA da grade `cols × rows` (cada ponto `cell` mm); devolve uma cópia.
 */
export function applyShapeMask(img: Uint8ClampedArray, cols: number, rows: number, cell: number, shape: CutShape, border: number): Uint8ClampedArray<ArrayBuffer> {
  const W = (cols - 1) * cell, H = (rows - 1) * cell;
  const poly = shapeOutline(shape, W, H);
  const out = new Uint8ClampedArray(img);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cell - W / 2, y = H / 2 - r * cell;
      let inside = false;
      let dist = Infinity;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        if (border > 0) dist = Math.min(dist, distToSegment(x, y, poly[j], poly[i]));
      }
      const o = (r * cols + c) * 4;
      if (!inside) out[o + 3] = 0;
      else if (dist < border) out.set([0, 0, 0, 255], o);
    }
  }
  return out;
}
