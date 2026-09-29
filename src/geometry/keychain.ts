import type { CS, ManifoldToplevel } from "./manifold";
import { layerParts, type ColorLayer2D } from "./extrude";
import { toMesh } from "./mesh";
import { roundedRect } from "./models/common";
import { outerOnly, scoped } from "./shape2d";
import type { Model } from "./types";

export type KeychainParams = {
  base: number; // espessura da base (mm)
  relief: number; // altura do texto/arte sobre a base
  border: number; // borda da base em volta do texto
  ring: boolean; // argola à esquerda
  ringOuter: number;
  ringHole: number;
  baseColor: string;
  topColor: string;
  /** Contorno do texto, etiqueta retangular ou silhueta enviada (SVG) com o nome por cima. */
  shape?: KeychainShape;
  /** Largura mínima da etiqueta retangular. */
  rectWidth?: number;
  /** 3 camadas: base, contorno do texto (meio) e texto (topo). */
  layers?: 2 | 3;
  midColor?: string;
};

export type KeychainShape = "outline" | "rect" | "silhouette";

export const DEFAULT_KEYCHAIN: KeychainParams = {
  base: 2.4,
  relief: 1,
  border: 3,
  ring: true,
  ringOuter: 4.5,
  ringHole: 2.2,
  baseColor: "#2563eb",
  topColor: "#ffffff",
  shape: "outline",
  rectWidth: 75,
  layers: 2,
  midColor: "#facc15",
};

const BRIDGE_MM = 4; // fechamento que une letras afastadas numa base só
const RING_OVERLAP_MM = 2.5;
const SLIVER_FRAC = 0.01; // sobra de borda entre a arte e as camadas de cor: não vira parte
const RECT_RADIUS_MM = 3;
const MID_MIN_MM = 1; // contorno mínimo da camada do meio

/** Etiqueta retangular: largura mínima `width`, altura do texto + borda, centrada no texto. */
function rectAround(M: ManifoldToplevel, art: CS, border: number, width: number): CS {
  const b = art.bounds();
  const w = Math.max(width, b.max[0] - b.min[0] + 2 * border), h = b.max[1] - b.min[1] + 2 * border;
  return scoped((k) => k(roundedRect(M, w, h, RECT_RADIUS_MM)).translate([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]));
}

/** Contorno do texto com `border` mm, letras afastadas unidas numa peça só. */
function outlineOf(M: ManifoldToplevel, art: CS, border: number): CS {
  return scoped((k) => {
    const out = outerOnly(M, k(k(art.offset(border + BRIDGE_MM, "Round")).offset(-BRIDGE_MM, "Round")));
    if (out.decompose().map(k).length <= 1) return out;
    k(out);
    return out.hull();
  });
}

/**
 * Chaveiro: base (contorno, etiqueta ou silhueta + borda, com argola) e desenho/texto em relevo, como partes separadas.
 * Com 3 camadas, um contorno do texto na cor do meio fica entre a base e o texto. `silhouette` (já posicionada) é a
 * forma da base no formato "silhueta".
 */
export function buildKeychain(M: ManifoldToplevel, art: CS, p: KeychainParams, name: string, layers: ColorLayer2D[] | null = null, silhouette: CS | null = null): Model {
  return scoped((k) => {
    const shape = p.shape ?? "outline";
    let base =
      shape === "rect"
        ? k(rectAround(M, art, p.border, p.rectWidth ?? 0))
        : shape === "silhouette" && silhouette
          ? k(outerOnly(M, k(k(outlineOf(M, art, p.border)).add(silhouette))))
          : k(outlineOf(M, art, p.border));
    if (p.ring) {
      // ponto mais à esquerda na faixa central da altura: a argola fica centrada, não num "pé" de letra
      const pts = base.toPolygons().flat();
      const b = base.bounds();
      const cy = (b.min[1] + b.max[1]) / 2;
      const band = (b.max[1] - b.min[1]) / 4;
      const mid = pts.filter((q) => Math.abs(q[1] - cy) <= band);
      const left = (mid.length ? mid : pts).reduce((a, q) => (q[0] < a[0] ? q : a));
      const c: [number, number] = [left[0] - p.ringOuter + RING_OVERLAP_MM, left[1]];
      const disc = k(M.CrossSection.circle(p.ringOuter, 48).translate(c));
      const hole = k(M.CrossSection.circle(p.ringHole, 32).translate(c));
      base = k(k(base.add(disc)).subtract(hole));
    }
    // com `layers` (logo colorido) o que não está nas camadas (o texto) segue na cor do texto
    const rest = layers ? k(art.subtract(k(M.CrossSection.union(layers.map((l) => l.cs))))) : art;
    const three = p.layers === 3;
    const zTop = three ? p.base + p.relief : p.base;
    const mid = three ? [{ name: "Meio", color: p.midColor ?? p.topColor, mesh: toMesh(k(k(k(outerOnly(M, k(art.offset(Math.max(MID_MIN_MM, p.border / 2), "Round")))).extrude(p.relief)).translate([0, 0, p.base]))) }] : [];
    const top = rest.isEmpty() || (layers && rest.area() < art.area() * SLIVER_FRAC) ? [] : [{ name: "Texto", color: p.topColor, mesh: toMesh(k(k(rest.extrude(p.relief)).translate([0, 0, zTop]))) }];
    return {
      name,
      parts: [{ name: "Base", color: p.baseColor, mesh: toMesh(k(base.extrude(p.base))) }, ...mid, ...top, ...(layers ? layerParts(layers, p.relief, zTop, "Logo") : [])],
    };
  });
}

/** Linhas de texto empilhadas e centradas (nome em duas linhas); `gap` entre as linhas. Quem chama dá delete(). */
export function stackLines(M: ManifoldToplevel, lines: CS[], gap: number): CS {
  let y = 0;
  const placed = lines.map((l) => {
    const b = l.bounds();
    const out = l.translate([-(b.min[0] + b.max[0]) / 2, y - b.max[1]]);
    y -= b.max[1] - b.min[1] + gap;
    return out;
  });
  const all = M.CrossSection.union(placed);
  placed.forEach((c) => c.delete());
  const b = all.bounds();
  const out = all.translate([0, -(b.min[1] + b.max[1]) / 2]);
  all.delete();
  return out;
}

/** "Ana|Silva" → ["Ana", "Silva"]: a barra vertical quebra o nome em linhas. */
export const splitLines = (s: string) => s.split("|").map((l) => l.trim()).filter(Boolean);

/** Nomes separados por linha ou vírgula, sem vazios e sem repetição. */
export function parseNames(s: string): string[] {
  return [...new Set(s.split(/[\n,;]/).map((n) => n.trim()).filter(Boolean))];
}

function translate(m: Model, dx: number, dy: number): Model {
  return {
    ...m,
    parts: m.parts.map((p) => {
      const pos = p.mesh.positions.slice();
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] += dx;
        pos[i + 1] += dy;
      }
      return { ...p, mesh: { ...p.mesh, positions: pos } };
    }),
  };
}

function bbox2(m: Model) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of m.parts) {
    const a = p.mesh.positions;
    for (let i = 0; i < a.length; i += 3) {
      x0 = Math.min(x0, a[i]);
      x1 = Math.max(x1, a[i]);
      y0 = Math.min(y0, a[i + 1]);
      y1 = Math.max(y1, a[i + 1]);
    }
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

/** Distribui os objetos em linhas dentro da mesa (lado `plate` mm), centralizados na origem. */
export function layoutOnPlate(models: Model[], plate: number, gap: number): Model[] {
  let x = 0, y = 0, rowH = 0;
  const placed = models.map((m) => {
    const b = bbox2(m);
    if (x > 0 && x + b.w > plate) {
      x = 0;
      y -= rowH + gap;
      rowH = 0;
    }
    const out = translate(m, x - b.x0, y - (b.y0 + b.h));
    x += b.w + gap;
    rowH = Math.max(rowH, b.h);
    return out;
  });
  const all = placed.map(bbox2).reduce((a, b) => ({
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    w: Math.max(a.x0 + a.w, b.x0 + b.w) - Math.min(a.x0, b.x0),
    h: Math.max(a.y0 + a.h, b.y0 + b.h) - Math.min(a.y0, b.y0),
  }));
  return placed.map((m) => translate(m, -(all.x0 + all.w / 2), -(all.y0 + all.h / 2)));
}
