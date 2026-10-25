import type { CS } from "../manifold";
import { outerOnly, fitInto, scoped } from "../shape2d";
import { moveMesh, requireArt, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { dome, hasSharpFeatures, roundEdge, scaleDome, type EjectorBottom } from "./ejectorBottom";

export type EjectorParams = {
  size: number; // largura do desenho
  height: number; // altura da forma
  wall: number;
  clearance: number; // folga entre o ejetor e a forma
  /** Fundo do doce: plano, borda arredondada (raio) ou domo (altura e suavização). Ausente = plano. */
  bottom?: EjectorBottom;
  radius?: number;
  domeHeight?: number;
  smooth?: number;
  frameColor: string;
  ejectorColor: string;
};

export const DEFAULT_EJECTOR: EjectorParams = { size: 30, height: 18, wall: 1.6, clearance: 0.4, bottom: "flat", radius: 3, domeHeight: 4, smooth: 0.7, frameColor: "#f472b6", ejectorColor: "#f8f8f6" };

const LIP_W = 3;
const LIP_H = 1.6;
const PLATE_H = 2.5;
const STEM_R = 3.5;
const KNOB_R = 8;
const KNOB_H = 2.5;
const FLARE_H = 4.5; // alarga o cabo em ~45° até o botão: imprime sem suporte
const GAP = 8;

/**
 * Ejetor de brigadeiro: forma no contorno do desenho (tubo com aba) e êmbolo que desliza dentro dela,
 * com haste e botão. A forma imprime com a aba na mesa; o êmbolo com a placa na mesa (fundo plano) ou de cabeça para
 * baixo, com o botão na mesa (fundo curvo: a curva fica virada para cima e sai sem suporte).
 */
export type EjectorOptions = {
  /** Marca (desenho ou texto) gravada no rosto do êmbolo: o doce sai com ela em relevo. Sem espelhar: o app espelha. */
  stamp?: CS | null;
  stampDepth?: number;
};

const STAMP_FRACTION = 0.7; // quanto do êmbolo a marca ocupa
const STAMP_MARGIN = 1.5; // borda que a marca deixa livre no êmbolo
const STAMP_DEPTH = 0.8;

/** A marca já ajustada ao êmbolo `plate` (centro `c`): no máximo 70% dele, com margem, sem espelhar. null se não sobra nada. */
export function fitStamp(plate: CS, c: [number, number], stamp: CS, mirror: boolean, k: <D extends { delete(): void }>(o: D) => D): CS | null {
  if (stamp.isEmpty()) return null;
  const room = k(plate.offset(-STAMP_MARGIN, "Round"));
  if (room.isEmpty()) return null;
  const rb = room.bounds();
  const fitted = k(fitInto(stamp, (rb.max[0] - rb.min[0]) * STAMP_FRACTION, (rb.max[1] - rb.min[1]) * STAMP_FRACTION, 0));
  const placed = k((mirror ? k(fitted.mirror([1, 0])) : fitted).translate([c[0], c[1]]));
  const mark = placed.intersect(room);
  return mark.isEmpty() ? (mark.delete(), null) : k(mark);
}


export function buildEjector({ M, art }: ModelCtx, p: EjectorParams, opts: EjectorOptions = {}): ModelOutput {
  const src = requireArt(art);
  return scoped((k) => {
    const shape = k(outerOnly(M, k(fitInto(src, p.size, p.size, 0))));
    const wall = k(k(shape.offset(p.wall, "Round")).subtract(shape));
    const lip = k(k(shape.offset(p.wall + LIP_W, "Round")).subtract(shape));
    const frame = k(M.Manifold.union(k(wall.extrude(p.height)), k(lip.extrude(LIP_H))));
    const plate = k(shape.offset(-p.clearance, "Round"));
    if (plate.isEmpty()) throw new Error("Desenho pequeno demais para o ejetor.");
    const b = plate.bounds();
    const c: [number, number] = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
    const stemH = p.height + 4;
    const stem = k(M.Manifold.cylinder(stemH, STEM_R, STEM_R, 32));
    const flare = k(k(M.Manifold.cylinder(FLARE_H, STEM_R, KNOB_R, 48)).translate([0, 0, stemH]));
    const knob = k(k(M.Manifold.cylinder(KNOB_H, KNOB_R, KNOB_R, 48)).translate([0, 0, stemH + FLARE_H]));
    const handle = k(k(M.Manifold.union([stem, flare, knob])).translate([c[0], c[1], PLATE_H]));
    let ejector = k(k(plate.extrude(PLATE_H)).add(handle));
    const warnings: string[] = [];
    // marca no rosto do êmbolo (a face que encosta no doce, de z = 0): rebaixo, espelhado para ler certo no doce
    const mark = opts.stamp ? fitStamp(plate, c, opts.stamp, true, k) : null;
    if (mark) ejector = k(ejector.subtract(k(mark.extrude(opts.stampDepth ?? STAMP_DEPTH))));
    const bottom = p.bottom ?? "flat";
    if (bottom !== "flat") {
      // a curva vai na face do doce (z = 0, para baixo); um cone de 45° sob a placa segura a placa quando o êmbolo
      // imprime de cabeça para baixo, com o botão na mesa
      const face = k(bottom === "round" ? roundEdge(M, plate, p.radius ?? 3) : (bottom === "scale" ? scaleDome : dome)(M, plate, p.domeHeight ?? 4, p.smooth ?? 0.7));
      const far = Math.max(...plate.toPolygons().flat().map(([x, y]) => Math.hypot(x - c[0], y - c[1]))); // cobre até a ponta mais longe
      const coneH = Math.max(0, Math.min(far - STEM_R, stemH - 1));
      const cone = k(k(k(M.Manifold.cylinder(coneH, STEM_R + coneH, STEM_R, 64)).translate([c[0], c[1], PLATE_H])).intersect(k(k(plate.extrude(coneH)).translate([0, 0, PLATE_H]))));
      ejector = k(k(M.Manifold.union([ejector, cone, k(face.mirror([0, 0, 1]))])).rotate([180, 0, 0])); // (x, y, z) → (x, −y, −z): sem espelhar o desenho
      ejector = k(ejector.translate([0, 2 * c[1], -ejector.boundingBox().min[2]]));
      warnings.push("Fundo arredondado: imprima o êmbolo com altura de camada de 0,08 a 0,12 mm para a curva sair lisa.");
      if (far - STEM_R > coneH) warnings.push("Forma larga para a altura: o apoio sob a placa do êmbolo não chega à borda. Ative suporte no fatiador ou aumente a altura da forma.");
      if (hasSharpFeatures(plate, bottom === "round" ? (p.radius ?? 3) : 2)) warnings.push("Esta forma tem ponta fina ou reentrância funda: ali o arredondado deforma. Prefira um desenho mais cheio ou raio menor.");
    }
    const fb = frame.boundingBox();
    const eb = ejector.boundingBox();
    return {
      models: [
        { name: "Forma", parts: [{ name: "Forma", color: p.frameColor, mesh: solidMesh(frame) }] },
        { name: "Ejetor", parts: [{ name: "Ejetor", color: p.ejectorColor, mesh: moveMesh(solidMesh(ejector), fb.max[0] - eb.min[0] + KNOB_R + GAP, 0) }] },
      ],
      warnings,
    };
  });
}
