import { decodeQr } from "../tools/qrDecode";
import type { ManifoldToplevel } from "./manifold";
import type { Mesh } from "./types";

type Pt = [number, number];

/**
 * Vista de cima do código como imagem em preto e branco (#114): o que um leitor enxerga olhando de frente, sem sombra.
 * `dark` é o relevo do código (todas as alturas juntas) e `size` o lado da placa; fora do código é claro.
 */
export function topViewImage(M: ManifoldToplevel, dark: Mesh, size: number, pxPerMm = 8): { rgba: Uint8ClampedArray; w: number; h: number } {
  const w = Math.round(size * pxPerMm), h = w;
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  const solid = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: dark.positions, triVerts: dark.indices }));
  const shadow = solid.project();
  const rings = shadow.toPolygons() as Pt[][];
  shadow.delete();
  solid.delete();
  const half = size / 2;
  for (let py = 0; py < h; py++) {
    const y = half - (py + 0.5) / pxPerMm;
    const xs: number[] = [];
    for (const r of rings)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] + half) * pxPerMm - 0.5)), to = Math.min(w - 1, Math.floor((xs[k + 1] + half) * pxPerMm - 0.5));
      for (let px = from; px <= to; px++) {
        const o = (py * w + px) * 4;
        rgba[o] = rgba[o + 1] = rgba[o + 2] = 0;
      }
    }
  }
  return { rgba, w, h };
}

/** Texto que um leitor de QR acha na vista de cima do código, ou null se não conseguir ler. */
export function readTopView(M: ManifoldToplevel, dark: Mesh, size: number, pxPerMm = 8): string | null {
  const img = topViewImage(M, dark, size, pxPerMm);
  return decodeQr(img.rgba, img.w, img.h);
}
