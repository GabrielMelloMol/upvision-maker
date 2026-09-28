import type { CS, ManifoldToplevel } from "./manifold";
import { layerParts, type ColorLayer2D } from "./extrude";
import { toMesh } from "./mesh";
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
};

export const DEFAULT_KEYCHAIN: KeychainParams = {
  base: 2.4,
  relief: 1,
  border: 3,
  ring: true,
  ringOuter: 4.5,
  ringHole: 2.2,
  baseColor: "#2563eb",
  topColor: "#ffffff",
};

const BRIDGE_MM = 4; // fechamento que une letras afastadas numa base só
const RING_OVERLAP_MM = 2.5;

/** Chaveiro de 2 cores: base (silhueta + borda, com argola) e desenho/texto em relevo, como partes separadas. */
export function buildKeychain(M: ManifoldToplevel, art: CS, p: KeychainParams, name: string, layers: ColorLayer2D[] | null = null): Model {
  return scoped((k) => {
    let base = k(outerOnly(M, k(k(art.offset(p.border + BRIDGE_MM, "Round")).offset(-BRIDGE_MM, "Round"))));
    if (base.decompose().map(k).length > 1) base = k(base.hull());
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
    const top = rest.isEmpty() ? [] : [{ name: "Texto", color: p.topColor, mesh: toMesh(k(k(rest.extrude(p.relief)).translate([0, 0, p.base]))) }];
    return {
      name,
      parts: [{ name: "Base", color: p.baseColor, mesh: toMesh(k(base.extrude(p.base))) }, ...top, ...(layers ? layerParts(layers, p.relief, p.base, "Logo") : [])],
    };
  });
}

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
