import type { ManifoldToplevel } from "../manifold";
import { solidMesh, type ModelCtx } from "../models/common";
import { buildScrewCase, caseLayout, DEFAULT_SCREW_CASE, type ScrewCaseParams } from "../models/screwCase";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { COLOR_KIT } from "./color";
import { couponOf } from "./catalog";
import { tag } from "./digits";

const fmt = (v: number) => v.toFixed(2).replace(".", ",");

/** Potinho pequeno e liso: o mesmo gerador do Estojo com rosca e do aromatizador, na rosca de 3 mm de passo e 2 entradas. */
const small = (clearance: number): ScrewCaseParams => ({
  ...DEFAULT_SCREW_CASE,
  innerDiameter: 14,
  innerHeight: 14,
  clearance,
  name: "",
  nameMode: "none",
  texture: "smooth",
  keyring: false,
  bodyColor: COLOR_KIT,
  lidColor: COLOR_KIT,
  accentColor: COLOR_KIT,
});

/** Rosca (#59, #219): cinco potinhos com tampa, só a folga muda; cada um com a etiqueta do número. */
export function threadPairs(M: ManifoldToplevel, ctx: ModelCtx): Model[] {
  const c = couponOf("thread");
  return c.sweep.map((cl, i) => {
    const p = small(cl);
    const out = buildScrewCase(ctx, p);
    const outer = caseLayout(p).outer;
    const label = scoped((k) => solidMesh(k(tag(M, k, i + 1).translate([outer, -outer - 7, 0]))));
    const parts = out.models.flatMap((m) => m.parts.filter((x) => x.name === "Corpo" || x.name === "Tampa")).map((x) => ({ ...x, color: COLOR_KIT }));
    return { name: `Rosca ${i + 1} (folga ${fmt(cl)})`, parts: [...parts, { name: "Número", color: COLOR_KIT, mesh: label }] };
  });
}
