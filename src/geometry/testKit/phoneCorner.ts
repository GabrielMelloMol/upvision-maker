import type { ManifoldToplevel } from "../manifold";
import { roundedRect, solidMesh } from "../models/common";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { COLOR_KIT } from "./color";
import { couponOf } from "./catalog";
import { tag, TAG } from "./digits";

const WALL = 1.6, FLOOR = 1.2, ARM = 28, VIRTUAL_LEN = 80;
const fmt = (v: number) => v.toFixed(2).replace(".", ",");

/**
 * Canto da capa (#232): só o trecho do canto de baixo de uma capa com o bolso do aparelho + folga (largura, espessura e raio do
 * canto): `ARM` mm de cada lado do canto, fundo de 1,2 mm e parede de 1,6 mm que sobe até a frente do aparelho.
 */
export function phoneCorners(M: ManifoldToplevel, phoneW: number, phoneT: number, cornerR: number): Model[] {
  const c = couponOf("phone");
  return c.sweep.map((cl, i) =>
    scoped((k) => {
      const [pw, pl, r] = [phoneW + 2 * cl, VIRTUAL_LEN, cornerR + cl];
      const H = FLOOR + phoneT + cl;
      const outer = k(k(roundedRect(M, pw + 2 * WALL, pl + 2 * WALL, r + WALL)).extrude(H));
      const pocket = k(k(k(roundedRect(M, pw, pl, r)).extrude(H + 2)).translate([0, 0, FLOOR]));
      const shell = k(outer.subtract(pocket));
      // só o canto: um quadrado de ARM mm em cada lado do canto de baixo (−x, −y)
      const x0 = -(pw / 2 + WALL), y0 = -(pl / 2 + WALL);
      const keep = k(k(M.Manifold.cube([ARM + WALL, ARM + WALL, H + 2])).translate([x0, y0, -1]));
      const corner = k(shell.intersect(keep));
      const label = k(tag(M, k, i + 1).translate([x0 + ARM + WALL + TAG.w / 2 - 1, y0 + TAG.d / 2, 0]));
      return { name: `Canto ${i + 1} (folga ${fmt(cl)})`, parts: [{ name: "Canto", color: COLOR_KIT, mesh: solidMesh(k(M.Manifold.union([corner, label]))) }] };
    }),
  );
}
