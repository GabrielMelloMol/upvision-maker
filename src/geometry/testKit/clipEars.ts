import type { ManifoldToplevel } from "../manifold";
import { solidMesh } from "../models/common";
import { scoped } from "../shape2d";
import { clipRegion } from "../thermo/screen";
import { DEFAULT_SCREEN } from "../thermo/screen";
import type { Model } from "../types";
import { COLOR_KIT } from "./color";
import { couponOf } from "./catalog";
import { tag, TAG } from "./digits";

const EAR_T = 1, EAR_LEN = 16, EAR_END = 3;
const fmt = (v: number) => v.toFixed(1).replace(".", ",");

/**
 * Orelhas e clipe da caixinha termoformada: duas orelhas iguais por tamanho de furo (a mesma largura e espessura da tela) e, no
 * fim, o clipe de verdade da ferramenta. A pessoa empilha duas orelhas e passa o clipe pelos furos.
 */
export function clipEars(M: ManifoldToplevel): Model[] {
  const c = couponOf("clip");
  const s = DEFAULT_SCREEN;
  const ears = c.sweep.map((hole, i) =>
    scoped((k) => {
      const one = (dx: number) => {
        const tab = k(k(M.Manifold.cube([s.earW, EAR_LEN, EAR_T], true)).translate([dx, 0, EAR_T / 2]));
        const cut = k(k(M.Manifold.cylinder(EAR_T + 2, hole / 2, hole / 2, 48)).translate([dx, EAR_LEN / 2 - EAR_END - hole / 2, -1]));
        return k(tab.subtract(cut));
      };
      const label = k(tag(M, k, i + 1).translate([0, -(EAR_LEN / 2) - TAG.d / 2 + 1, 0]));
      const pair = [one(-(s.earW / 2 + 2)), k(M.Manifold.union([one(s.earW / 2 + 2), label]))];
      return { name: `Orelhas ${i + 1} (furo ${fmt(hole)})`, parts: pair.map((p, j) => ({ name: `Orelha ${j + 1}`, color: COLOR_KIT, mesh: solidMesh(p) })) };
    }),
  );
  const clip = scoped((k) => ({ name: "Clipe", parts: [{ name: "Clipe", color: COLOR_KIT, mesh: solidMesh(k(clipRegion(M, s, k).extrude(s.clipT))) }] }));
  return [...ears, clip];
}
