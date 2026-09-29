import type { CS, Solid } from "../manifold";
import { fitInto, outerOnly, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { backing, MissingInput, plateStand, roundedRect, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type WindowKind = "shaker" | "acetate" | "fabric";
export type WindowShape = "circle" | "rect" | "text" | "art";
export type WindowMount = "topper" | "stand" | "hang";

export type WindowFrameParams = {
  kind: WindowKind;
  shape: WindowShape;
  shapeText: string; // formato "texto": a moldura contorna este texto
  size: number;
  wall: number;
  back: number; // fundo (shaker e acetato) ou aro de trás (tecido)
  chamber: number; // profundidade da câmara de glitter
  sheet: number; // espessura da folha de acetato
  clearance: number;
  lip: number; // aba por cima da folha
  fabricAt: number; // tecido: altura da pausa
  name: string;
  nameHeight: number;
  relief: number;
  mount: WindowMount;
  layerHeight: number;
  frameColor: string;
  textColor: string;
};

export const DEFAULT_WINDOW_FRAME: WindowFrameParams = {
  kind: "shaker",
  shape: "circle",
  shapeText: "15",
  size: 80,
  wall: 4,
  back: 1.6,
  chamber: 3,
  sheet: 0.3,
  clearance: 0.2,
  lip: 1.2,
  fabricAt: 1.2,
  name: "Ana",
  nameHeight: 14,
  relief: 1,
  mount: "topper",
  layerHeight: 0.2,
  frameColor: "#f472b6",
  textColor: "#ffffff",
};

const SLOT_LIP = 2; // a folha entra este tanto por baixo da moldura, em volta da janela
const STICK_W = 4;
const STICK_L = 70;
const HANG_R = 2;
const NAME_GAP = 8;

/** Topo da camada que contém `z` (a pausa acontece antes da camada seguinte). */
const layerTop = (z: number, lh: number) => Math.round(Math.ceil(z / lh - 1e-6) * lh * 1000) / 1000;

function outline(ctx: ModelCtx, p: WindowFrameParams, k: <D extends { delete(): void }>(o: D) => D): CS {
  const { M } = ctx;
  if (p.shape === "circle") return k(M.CrossSection.circle(p.size / 2, 128));
  if (p.shape === "rect") return k(roundedRect(M, p.size, p.size * 0.75, 6));
  const src = p.shape === "art" ? ctx.art : ctx.text(p.shapeText, p.size);
  if (!src) throw new MissingInput(p.shape === "art" ? "Envie o desenho da moldura." : "Digite o texto da moldura.");
  const fitted = k(fitInto(p.shape === "art" ? src : k(src), p.size, p.size, 0));
  return k(outerOnly(M, k(backing(M, fitted, p.wall))));
}

/**
 * Peça com janela: moldura com **câmara de glitter** e **ranhura para acetato** (shaker), só janela de acetato, ou
 * aro com **pausa para tecido** (tule). A folha entra por uma ranhura mais larga que a janela; a impressora pausa
 * antes da aba que a prende. Nome por cima; sai como topo de bolo (palitos), em pé (suporte) ou para pendurar.
 */
export function buildWindowFrame(ctx: ModelCtx, p: WindowFrameParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const out = outline(ctx, p, k);
    const win = k(out.offset(-p.wall, "Round"));
    if (win.isEmpty()) throw new Error("Moldura pequena demais para a parede escolhida.");
    const ring = k(out.subtract(win));
    const layers: Solid[] = [];
    const pauses: number[] = [];
    const warnings: string[] = [];
    let z = 0;
    const add = (cs: CS, h: number) => {
      layers.push(k(k(cs.extrude(h)).translate([0, 0, z])));
      z += h;
    };
    if (p.kind === "fabric") {
      // aro de trás, pausa para esticar o tecido, resto da moldura
      add(ring, p.fabricAt);
      pauses.push(layerTop(p.fabricAt, p.layerHeight));
      add(ring, p.back + p.lip);
      warnings.push(`Pausa em ${pauses[0]} mm: estique o tecido (tule) sobre a moldura, prenda com fita nas bordas e continue.`);
    } else {
      add(out, p.back);
      if (p.kind === "shaker") add(ring, p.chamber);
      const gap = p.sheet + p.clearance;
      const slotRing = k(out.subtract(k(win.offset(SLOT_LIP, "Round"))));
      if (slotRing.isEmpty()) throw new Error("Parede fina demais para a ranhura do acetato: aumente a parede.");
      add(slotRing, gap);
      pauses.push(layerTop(z, p.layerHeight));
      add(ring, p.lip);
      warnings.push(
        p.kind === "shaker"
          ? `Pausa em ${pauses[0]} mm: coloque o glitter na câmara, deslize a folha de acetato na ranhura e continue.`
          : `Pausa em ${pauses[0]} mm: deslize a folha de acetato na ranhura e continue.`,
      );
    }
    const top = z;
    let frame = k(M.Manifold.union(layers));
    const b = out.bounds();
    const extra: Model[] = [];
    if (p.mount === "topper") {
      for (const x of [-p.size / 5, p.size / 5]) {
        const stick = k(k(M.Manifold.cube([STICK_W, STICK_L, Math.min(top, 3)])).translate([x - STICK_W / 2, b.min[1] - STICK_L + p.wall, 0]));
        frame = k(frame.add(stick));
      }
    } else if (p.mount === "hang") {
      const hole = k(k(M.Manifold.cylinder(top * 3, HANG_R, HANG_R, 24)).translate([0, b.max[1] - p.wall / 2, -top]));
      frame = k(frame.subtract(hole));
      if (p.wall < 2 * HANG_R + 1.5) warnings.push("Parede fina para o furo de pendurar: aumente a parede.");
    } else extra.push(plateStand(M, p.size, top, p.frameColor, b.min[1] - 30));
    const parts: Part[] = [{ name: "Moldura", color: p.frameColor, mesh: solidMesh(frame) }];
    const name = ctx.text(p.name, p.nameHeight);
    if (name) {
      // o nome sai à parte (por cima da janela ficaria no ar): cola na frente, sobre o acetato ou a moldura
      const placed = k(fitInto(k(name), (b.max[0] - b.min[0]) * 0.9, p.nameHeight, 0));
      const nb = placed.bounds();
      extra.unshift({ name: p.name.trim(), parts: [{ name: "Nome", color: p.textColor, mesh: slab(k(placed.translate([0, b.max[1] + NAME_GAP - nb.min[1]])), p.relief) }] });
    }
    return { models: [{ name: "Janela", parts }, ...extra], pauses, warnings };
  });
}
