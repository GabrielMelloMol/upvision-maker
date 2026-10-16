import type { ManifoldToplevel } from "../manifold";
import { roundedRect, solidMesh } from "../models/common";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { COLOR_KIT } from "./color";
import { couponOf } from "./catalog";
import { tag, TAG } from "./digits";
import { gearOutline, gearRadii, spurSpec } from "./gearTooth";

const TEETH = 12, MODULE = 1.5, PRESSURE = 20, THICK = 5, PIN_R = 1.6, BORE_R = 1.85, BASE_T = 2, PIN_H = THICK + 3;
const fmt = (v: number) => v.toFixed(2).replace(".", ",");

/** Par de engrenagens de teste (#230): m 1,5 e 12 dentes, folga `backlash` tirada do dente; base com os pinos na distância exata. */
export function gearPairs(M: ManifoldToplevel): Model[] {
  const c = couponOf("gear");
  return c.sweep.map((b, i) =>
    scoped((k) => {
      const spec = spurSpec(TEETH, MODULE, PRESSURE, b);
      const r = gearRadii(spec);
      const a = MODULE * TEETH; // distância entre os eixos de duas engrenagens iguais
      const gear = () => {
        const body = k(k(gearOutline(M, spec)).extrude(THICK));
        return k(body.subtract(k(k(M.Manifold.cylinder(THICK + 2, BORE_R, BORE_R, 40)).translate([0, 0, -1]))));
      };
      const baseW = a + 2 * (r.ra + 3), baseD = 2 * (r.ra + 3);
      const plate = k(k(roundedRect(M, baseW, baseD, 3)).extrude(BASE_T));
      const pin = (x: number) => k(k(M.Manifold.cylinder(PIN_H, PIN_R, PIN_R, 40)).translate([x, 0, BASE_T - 0.01]));
      const label = k(tag(M, k, i + 1).translate([baseW / 2 + TAG.w / 2 - 1, 0, 0]));
      const base = k(M.Manifold.union([plate, pin(-a / 2), pin(a / 2), label]));
      const dy = baseD / 2 + r.ra + 6;
      const loose = (x: number) => k(gear().translate([x, -dy, 0]));
      const parts = [
        { name: "Base", color: COLOR_KIT, mesh: solidMesh(base) },
        { name: "Engrenagem 1", color: COLOR_KIT, mesh: solidMesh(loose(-r.ra - 3)) },
        { name: "Engrenagem 2", color: COLOR_KIT, mesh: solidMesh(loose(r.ra + 3)) },
      ];
      return { name: `Engrenagens ${i + 1} (jogo ${fmt(b)})`, parts };
    }),
  );
}
