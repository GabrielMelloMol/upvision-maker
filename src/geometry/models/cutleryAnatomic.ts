import { fitInto, scoped } from "../shape2d";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import type { Model } from "../types";
import { roundedRect, solidMesh, type ModelCtx } from "./common";
import type { TrayPlan } from "./cutleryPlan";

/*
 * Bandeja de talheres anatômica (#214): cada divisão é uma cápsula com o contorno do talher (garfo, faca, colher,
 * colherzinha), com paredes que seguem o contorno e o nome em relevo no fundo, em vez de caixas retangulares. O espaço
 * entre as cápsulas fica aberto (cabe tampa, abridor, o que sobrar). Recomendado em PETG, como a bandeja reta.
 */
export type UtensilKind = "spoon" | "teaspoon" | "fork" | "knife";

/** Medidas de um talher comum em mm (comprimento total, largura da cabeça, comprimento da cabeça, largura do cabo). */
const DIMS: Record<UtensilKind, { length: number; headW: number; headL: number; handleW: number }> = {
  spoon: { length: 190, headW: 46, headL: 66, handleW: 22 },
  teaspoon: { length: 150, headW: 36, headL: 52, handleW: 18 },
  fork: { length: 200, headW: 34, headL: 66, handleW: 20 },
  knife: { length: 230, headW: 22, headL: 110, handleW: 22 },
};

const WALL = 2;
const FLOOR = 2;
const CLEAR = 3; // folga do contorno para o talher entrar
const CORNER = 6;
const SCOOP = 14;
const NECK = 7; // raio da curva entre o cabo e a cabeça
const MAX_SCALE = 1.3; // quanto o contorno pode crescer para encher uma divisão larga
const RELIEF = 0.6;
const NAME_H = 0.5; // altura do nome, em fração da largura do cabo

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Que talher uma divisão guarda, pelo nome ("Colherzinha" antes de "Colher"); null = utensílio qualquer (retangular). */
export function utensilOf(label: string): UtensilKind | null {
  const l = plain(label);
  if (l.includes("colherzinha") || l.includes("cafe") || l.includes("sobremesa")) return "teaspoon";
  if (l.includes("garfo")) return "fork";
  if (l.includes("faca")) return "knife";
  if (l.includes("colher")) return "spoon";
  return null;
}

/**
 * Contorno do talher com o cabo para a frente (y = 0) e a cabeça para trás, centrado em x = 0, já com a folga e
 * escalado por `scale`. Quem chama dá delete().
 */
export function utensilOutline(M: ManifoldToplevel, kind: UtensilKind, scale = 1): CS {
  const d = DIMS[kind];
  return scoped((k) => {
    const L = d.length * scale, hw = d.handleW * scale, headW = d.headW * scale, headL = d.headL * scale;
    const handle = k(k(M.CrossSection.square([hw, L - headL * 0.5], true)).translate([0, (L - headL * 0.5) / 2]));
    const head =
      kind === "knife"
        ? // lâmina: costas retas de um lado, gume curvo até a ponta
          k(new M.CrossSection([[[-headW / 2, L - headL], [headW / 2, L - headL], [headW / 2, L - headL * 0.35], [0, L], [-headW / 2, L - headL * 0.55]]], "NonZero"))
        : kind === "fork"
          ? k(k(roundedRect(M, headW, headL, Math.min(headW, headL) * 0.3)).translate([0, L - headL / 2]))
          : k(k(k(M.CrossSection.circle(1, 64)).scale([headW / 2, headL / 2])).translate([0, L - headL / 2]));
    const joined = k(M.CrossSection.union([handle, head]));
    // fecha a quina entre o cabo e a cabeça (offset para fora e de volta) e abre a folga
    const smooth = k(k(joined.offset(NECK, "Round", 2, 48)).offset(-NECK, "Round", 2, 48));
    return smooth.offset(CLEAR, "Round", 2, 48);
  });
}

/** Maior largura do contorno de cada talher na escala 1 (para escolher a escala da divisão). */
const widthOf = (kind: UtensilKind) => Math.max(DIMS[kind].headW, DIMS[kind].handleW) + 2 * CLEAR;

/**
 * Bandeja anatômica: fundo, parede de fora, uma cápsula de parede por talher (com rampa para os dedos e o nome no
 * fundo) e a alça em meia-lua nas pontas. Divisões que não são talher ficam como caixa retangular.
 */
export function buildAnatomicTray(ctx: ModelCtx, t: TrayPlan, depth: number, height: number, color: string, nameColor: string): Model {
  const { M } = ctx;
  return scoped((k) => {
    const W = t.width, D = depth;
    const outer = k(k(k(roundedRect(M, W, D, CORNER)).extrude(height)).translate([W / 2, D / 2, 0]));
    const innerCs = k(roundedRect(M, W - 2 * WALL, D - 2 * WALL, Math.max(CORNER - WALL, 1)));
    const rim = k(outer.subtract(k(k(innerCs.extrude(height)).translate([W / 2, D / 2, FLOOR]))));
    const floor = k(k(k(roundedRect(M, W, D, CORNER)).extrude(FLOOR)).translate([W / 2, D / 2, 0]));
    const walls: Solid[] = [rim, floor];
    const names: CS[] = [];
    const total = t.lanes.reduce((a, l) => a + l.width, 0);
    const inner = W - 2 * WALL;
    let x = WALL;
    for (const lane of t.lanes) {
      const w = (lane.width / total) * inner;
      const cx = x + w / 2;
      x += w;
      const kind = utensilOf(lane.label);
      if (!kind) {
        // divisão sem talher: caixa retangular com paredes finas até em cima
        const box = k(roundedRect(M, w, D - 2 * WALL, Math.min(CORNER, w / 2 - 0.1)));
        const ring = k(k(box.offset(WALL, "Round", 2, 32)).subtract(box));
        walls.push(k(k(ring.extrude(height)).translate([cx, D / 2, 0])));
        continue;
      }
      // escala: enche a divisão sem passar da largura nem do comprimento disponíveis
      const scale = Math.min(MAX_SCALE, Math.max(0.6, (w - 2 * WALL) / widthOf(kind)), (D - 2 * WALL - 4 - 2 * CLEAR) / DIMS[kind].length);
      const pocket = k(utensilOutline(M, kind, scale));
      const pb = pocket.bounds();
      const place = (c: CS) => k(c.translate([cx, WALL + 2 - pb.min[1]]));
      const cavity = place(pocket);
      const ring = k(k(cavity.offset(WALL, "Round", 2, 32)).subtract(cavity));
      walls.push(k(ring.extrude(height)));
      // rampa para os dedos no pé do cabo, só dentro da cápsula
      const r = Math.min(SCOOP, (height - FLOOR) / 2);
      const quarter = k(k(M.CrossSection.square([r, r])).subtract(k(k(M.CrossSection.circle(r, 48)).translate([r, r]))));
      const scoop = k(k(k(quarter.extrude(pb.max[0] - pb.min[0])).rotate([90, 0, 90])).translate([cx - (pb.max[0] - pb.min[0]) / 2, WALL, FLOOR]));
      const insideCavity = k(k(cavity.extrude(r + 1)).translate([0, 0, FLOOR]));
      walls.push(k(scoop.intersect(insideCavity)));
      // nome em relevo no fundo, ao longo do cabo
      const handleW = DIMS[kind].handleW * scale;
      const raw = ctx.text(lane.label.toUpperCase(), handleW * NAME_H);
      if (raw) {
        const fitted = k(fitInto(k(raw), DIMS[kind].length * scale * 0.4, handleW * NAME_H, 0));
        const turned = k(fitted.rotate(90));
        names.push(k(turned.translate([cx, WALL + 2 - pb.min[1] + DIMS[kind].length * scale * 0.3])));
      }
    }
    let s: Solid = k(M.Manifold.union(walls));
    // alça: meia-lua no topo das paredes da frente e de trás
    const handle = k(k(k(M.CrossSection.circle(16, 48)).extrude(D + 2)).rotate([90, 0, 0]));
    s = k(s.subtract(k(handle.translate([W / 2, D + 1, height]))));
    const parts: Model["parts"] = [{ name: "Bandeja", color, mesh: solidMesh(s) }];
    if (names.length) {
      const relief = k(k(M.CrossSection.union(names)).extrude(RELIEF + 0.01));
      parts.push({ name: "Nomes", color: nameColor, mesh: solidMesh(k(relief.translate([0, 0, FLOOR - 0.01]))) });
    }
    return { name: "Bandeja", parts };
  });
}
