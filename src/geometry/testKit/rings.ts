import type { ManifoldToplevel, Solid } from "../manifold";
import { roundedRect, solidMesh } from "../models/common";
import { scoped } from "../shape2d";
import type { Model } from "../types";
import { COLOR_KIT } from "./color";
import { couponOf } from "./catalog";
import { tag, TAG, type K } from "./digits";

const part = (name: string, s: Solid) => ({ name, color: COLOR_KIT, mesh: solidMesh(s) });
const cyl = (M: ManifoldToplevel, k: K, h: number, r: number, z = 0) => k(k(M.Manifold.cylinder(h, r, r, 96)).translate([0, 0, z]));
const fmt = (v: number) => v.toFixed(2).replace(".", ",");

const RING_H = 14, RING_WALL = 3;
/** Anel do copo (#221): ø interno = copo + 2 × folga, 14 mm de altura, etiqueta soldada na lateral. */
export function cupRings(M: ManifoldToplevel, cupDiameter: number): Model[] {
  const c = couponOf("cup");
  return c.sweep.map((cl, i) =>
    scoped((k) => {
      const rIn = cupDiameter / 2 + cl;
      const ring = k(cyl(M, k, RING_H, rIn + RING_WALL).subtract(cyl(M, k, RING_H + 2, rIn, -1)));
      const label = k(tag(M, k, i + 1).translate([rIn + RING_WALL + TAG.w / 2 - 1, 0, 0]));
      return { name: `Anel ${i + 1} (folga ${fmt(cl)})`, parts: [part("Anel", k(M.Manifold.union([ring, label])))] };
    }),
  );
}

const FRAME_H = 3, FRAME_WALL = 2;
/** Moldura da placa (#233): bolso do tamanho da placa + 2 × folga, parede de 2 mm e 3 mm de altura. */
export function boardFrames(M: ManifoldToplevel, boardL: number, boardW: number): Model[] {
  const c = couponOf("board");
  return c.sweep.map((cl, i) =>
    scoped((k) => {
      const [iw, id] = [boardL + 2 * cl, boardW + 2 * cl];
      const outer = k(k(roundedRect(M, iw + 2 * FRAME_WALL, id + 2 * FRAME_WALL, 1.5)).extrude(FRAME_H));
      const inner = k(k(k(roundedRect(M, iw, id, 0.5)).extrude(FRAME_H + 2)).translate([0, 0, -1]));
      const label = k(tag(M, k, i + 1).translate([iw / 2 + FRAME_WALL + TAG.w / 2 - 1, 0, 0]));
      return { name: `Moldura ${i + 1} (folga ${fmt(cl)})`, parts: [part("Moldura", k(M.Manifold.union([k(outer.subtract(inner)), label])))] };
    }),
  );
}

const SLEEVE_H = 12, SLEEVE_WALL = 2;
/** Êmbolo do docinho (#220): tubo de ø interno = êmbolo + 2 × folga e o êmbolo, soltos (um par por folga). */
export function candyPlungers(M: ManifoldToplevel, plungerD: number): Model[] {
  const c = couponOf("candy");
  return c.sweep.map((cl, i) =>
    scoped((k) => {
      const rIn = plungerD / 2 + cl;
      const sleeve = k(cyl(M, k, SLEEVE_H, rIn + SLEEVE_WALL).subtract(cyl(M, k, SLEEVE_H + 2, rIn, -1)));
      const label = k(tag(M, k, i + 1).translate([rIn + SLEEVE_WALL + TAG.w / 2 - 1, 0, 0]));
      const plunger = k(cyl(M, k, SLEEVE_H, plungerD / 2).translate([-(rIn + SLEEVE_WALL + plungerD / 2 + 6), 0, 0]));
      return { name: `Êmbolo ${i + 1} (folga ${fmt(cl)})`, parts: [part("Tubo", k(M.Manifold.union([sleeve, label]))), part("Êmbolo", plunger)] };
    }),
  );
}
