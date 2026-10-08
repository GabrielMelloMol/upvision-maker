import type { CS, ManifoldToplevel } from "./manifold";
import type { Model } from "./types";

/** Espaço entre o logo e o texto na posição automática. */
export const LOGO_GAP_MM = 2;

/** Ajuste feito à mão na arte do chaveiro (#183): giro em graus (anti-horário) e deslocamento em mm a partir do automático. */
export type LogoMove = { rot: number; dx: number; dy: number };
export const NO_MOVE: LogoMove = { rot: 0, dx: 0, dy: 0 };

type Layer = { color: string; cs: CS };
export type ComposedArt = {
  /** Texto + logo (o que a base contorna). */
  art: CS;
  /** Logo já girado e no lugar (ou null sem logo). */
  logo: CS | null;
  /** Camadas de cor do logo, no mesmo lugar. */
  layers: Layer[] | null;
  /** Onde ficou o centro do logo, em mm. */
  center: [number, number];
};

/**
 * Posição automática do centro do logo: encostado à esquerda do texto, centrado na altura dele; sem texto, ou na
 * silhueta (o logo é a base), na origem. Não depende do giro: o ajuste manual é sempre a partir daqui.
 */
export function autoLogoCenter(textMinX: number | null, logoWidth: number, silhouette: boolean): [number, number] {
  return textMinX === null || silhouette ? [0, 0] : [textMinX - LOGO_GAP_MM - logoWidth / 2, 0];
}

/** Deslocamento (arredondado a 0,1 mm) que leva o centro automático até onde a alça foi solta. */
export function offsetFromCenter(center: [number, number], auto: [number, number]): { dx: number; dy: number } {
  const r = (n: number) => Math.round(n * 10) / 10;
  return { dx: r(center[0] - auto[0]), dy: r(center[1] - auto[1]) };
}

/**
 * Junta texto e logo: o logo (já no tamanho, centrado na origem) gira em torno do próprio centro e vai para a posição
 * automática mais o deslocamento. `k` registra o que criar para o dono apagar depois.
 */
export function composeKeychainArt(
  k: (cs: CS) => CS,
  { text, logo, layers, move, silhouette }: { text: CS | null; logo: CS | null; layers: Layer[] | null; move: LogoMove; silhouette: boolean },
): ComposedArt {
  let center: [number, number] = [0, 0];
  if (logo) {
    const b = logo.bounds();
    center = autoLogoCenter(text ? text.bounds().min[0] : null, b.max[0] - b.min[0], silhouette);
    center = [center[0] + move.dx, center[1] + move.dy];
  }
  const put = (cs: CS) => k(k(cs.rotate(move.rot)).translate(center));
  const placed = logo ? put(logo) : null;
  const placedLayers = silhouette ? null : (layers?.map((l) => ({ color: l.color, cs: put(l.cs) })) ?? null);
  const art = silhouette ? text! : text && placed ? k(text.add(placed)) : (text ?? placed)!;
  return { art, logo: placed, layers: placedLayers, center };
}

/** Silhueta vista de cima de uma parte do modelo (padrão: a base), em polígonos mm; para a vista de cima das alças. */
export function topOutline(M: ManifoldToplevel, model: Model, part = "Base"): [number, number][][] {
  const p = model.parts.find((x) => x.name === part) ?? model.parts[0];
  if (!p) return [];
  const solid = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: p.mesh.positions, triVerts: p.mesh.indices }));
  const cs = solid.project();
  const polys = cs.toPolygons() as [number, number][][];
  cs.delete();
  solid.delete();
  return polys;
}
