import type { CS, ManifoldToplevel } from "./manifold";
import { scoped } from "./shape2d";

/** Ícones genéricos desenhados aqui (sem logos de marca): cabem num quadrado de lado 1, centrados na origem. */
export type IconKind = "wifi" | "chat" | "camera" | "stars" | "link" | "phone";

type K = <D extends { delete(): void }>(o: D) => D;
const W = 0.1; // espessura do traço (fração do lado)

function arcBand(M: ManifoldToplevel, k: K, r: number, from: number, to: number): CS {
  const ring = k(k(M.CrossSection.circle(r + W / 2, 64)).subtract(k(M.CrossSection.circle(r - W / 2, 64))));
  const a0 = (from * Math.PI) / 180, a1 = (to * Math.PI) / 180;
  const wedge = k(new M.CrossSection([[[0, 0], [2 * Math.cos(a0), 2 * Math.sin(a0)], [2 * Math.cos((a0 + a1) / 2), 2 * Math.sin((a0 + a1) / 2)], [2 * Math.cos(a1), 2 * Math.sin(a1)]]], "NonZero"));
  return k(ring.intersect(wedge));
}

const rrect = (M: ManifoldToplevel, k: K, w: number, h: number, r: number) => k(k(M.CrossSection.square([w - 2 * r, h - 2 * r], true)).offset(r, "Round"));
const outlineOf = (k: K, cs: CS) => k(cs.subtract(k(cs.offset(-W, "Round"))));

function star(M: ManifoldToplevel, k: K, r: number): CS {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    return [rr * Math.cos(a), rr * Math.sin(a)] as [number, number];
  });
  return k(new M.CrossSection([pts], "NonZero"));
}

/** Ícone no tamanho `size` (mm). */
export function iconCs(M: ManifoldToplevel, kind: IconKind, size: number): CS {
  return scoped((k) => {
    let cs: CS;
    if (kind === "wifi") {
      const bands = [0.2, 0.38, 0.56].map((r) => arcBand(M, k, r, 45, 135));
      cs = k(k(M.CrossSection.union([...bands, k(M.CrossSection.circle(W * 0.8, 24))])).translate([0, -0.25]));
    } else if (kind === "chat") {
      const bubble = rrect(M, k, 0.9, 0.62, 0.18);
      const tail = k(new M.CrossSection([[[-0.3, -0.25], [-0.1, -0.25], [-0.36, -0.46]]], "NonZero"));
      const body = k(k(bubble.add(tail)).translate([0, 0.1]));
      const dots = [-0.22, 0, 0.22].map((x) => k(k(M.CrossSection.circle(0.06, 16)).translate([x, 0.1])));
      cs = k(outlineOf(k, body).add(k(M.CrossSection.union(dots))));
    } else if (kind === "camera") {
      const frame = outlineOf(k, rrect(M, k, 0.9, 0.9, 0.25));
      const lens = k(k(M.CrossSection.circle(0.24, 48)).subtract(k(M.CrossSection.circle(0.24 - W, 48))));
      cs = k(M.CrossSection.union([frame, lens, k(k(M.CrossSection.circle(0.06, 16)).translate([0.26, 0.26]))]));
    } else if (kind === "stars") {
      cs = k(M.CrossSection.union([-0.4, -0.2, 0, 0.2, 0.4].map((x) => k(k(star(M, k, 0.1)).translate([x, 0])))));
    } else if (kind === "link") {
      const ring = outlineOf(k, rrect(M, k, 0.62, 0.3, 0.15));
      cs = k(k(M.CrossSection.union([k(ring.translate([-0.17, 0])), k(ring.translate([0.17, 0]))])).rotate(-35));
    } else {
      // fone: retângulo arredondado com tela
      const body = rrect(M, k, 0.5, 0.9, 0.08);
      cs = k(outlineOf(k, body).add(k(k(M.CrossSection.circle(0.05, 16)).translate([0, -0.33]))));
    }
    const b = cs.bounds();
    const s = size / Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]);
    return k(cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2])).scale(s);
  });
}
