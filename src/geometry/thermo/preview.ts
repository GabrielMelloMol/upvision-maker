import type { CS, ManifoldToplevel, Solid } from "../manifold";
import type { Mesh } from "../types";
import { domeStack, magnificationAtHeight, type DomeGeo } from "./dome";
import { meshHoles, type ScreenParams } from "./screen";

type K = <D extends { delete(): void }>(o: D) => D;

const SLACK = 1; // furo da malha da prévia passa 1 mm de cada lado da casca
const TALL = 200;

/** Junta malhas fechadas separadas numa só (as duas metades da caixa). */
export function mergeMeshes(list: Mesh[]): Mesh {
  const positions = new Float32Array(list.reduce((n, m) => n + m.positions.length, 0));
  const indices = new Uint32Array(list.reduce((n, m) => n + m.indices.length, 0));
  let po = 0, io = 0, base = 0;
  for (const m of list) {
    positions.set(m.positions, po);
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + base;
    po += m.positions.length;
    io += m.indices.length;
    base += m.positions.length / 3;
  }
  return { positions, indices };
}

const BANDS = 14;

/**
 * Meia casca já prensada sobre o molde: a casca de `t` mm em volta do domo, com a malha vazada, a borda e o desenho
 * (no tamanho final pedido, não o encolhido da tela plana) em partes separadas. A malha acompanha o esticamento: em cada
 * faixa de altura, os furos da tela plana são ampliados pelo quanto o domo amplia ali (maior no topo, 1 na borda).
 * `design` é o desenho final; `flatDesign`, o encolhido da tela plana (os furos desviam dele). Ambos podem ser null.
 */
export function formedShell(M: ManifoldToplevel, sil: CS, design: CS | null, flatDesign: CS | null, g: DomeGeo, p: ScreenParams, k: K): { border: Solid; mesh: Solid; design: Solid | null } {
  const inner = k(sil.offset(-p.border, "Round")); // o domo nasce no limite interno da borda: a borda fica plana sobre o apoio
  const shell = k(domeStack(M, inner, g, p.t, k).subtract(domeStack(M, inner, g, 0, k)));
  const flatInner = flatDesign ? k(flatDesign.intersect(inner)) : null;
  const field = flatInner ? k(inner.subtract(flatInner)) : inner;
  const holes = k(meshHoles(M, sil.bounds(), p, k).intersect(k(field.offset(-p.wire, "Round"))));
  const m = magnificationAtHeight(g);
  const zTop = g.H + p.t;
  const dzB = (zTop + SLACK) / BANDS;
  const cutters: Solid[] = [];
  for (let b = 0; b < BANDS; b++) {
    const z0 = -SLACK + b * dzB;
    const scaled = k(holes.scale(m(Math.min(g.H, Math.max(0, z0 + dzB / 2)))));
    const clipped = k(scaled.intersect(inner));
    if (clipped.isEmpty()) continue;
    cutters.push(k(k(clipped.extrude(dzB + 0.001)).translate([0, 0, z0])));
  }
  const ring = k(sil.subtract(inner));
  const flatBorder = k(ring.extrude(p.t));
  const open = k((cutters.length ? k(shell.subtract(k(M.Manifold.union(cutters)))) : shell).subtract(k(k(ring.extrude(p.t + 0.02)).translate([0, 0, -0.01]))));
  const d = design ? k(design.intersect(inner)) : null;
  const designSolid = d && !d.isEmpty() ? k(open.intersect(k(d.extrude(TALL)))) : null;
  return { border: flatBorder, mesh: designSolid ? k(open.subtract(designSolid)) : open, design: designSolid };
}
