import { modelsBounds } from "../bounds";
import type { CS, Solid } from "../manifold";
import { fitInto, outerOnly, scoped } from "../shape2d";
import type { Model } from "../types";
import { MissingInput, moveModel, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { splitToBed } from "./splitBed";

export type LedStyle = "flush" | "halo" | "raised" | "double";

export type LedLetterParams = {
  text: string;
  height: number;
  depth: number; // profundidade da caixa
  wall: number;
  style: LedStyle;
  stripWidth: number; // largura da fita de LED
  wireHole: number; // diâmetro do furo do fio
  diffuser: number; // espessura do difusor (face/tampa)
  clearance: number; // folga do difusor/tampa
  standoff: number; // retroiluminada: distância da parede
  overlay: string; // nome sobreposto na frente (peça à parte)
  overlayHeight: number;
  bodyColor: string;
  diffuserColor: string;
  overlayColor: string;
};

export const DEFAULT_LED_LETTER: LedLetterParams = {
  text: "A",
  height: 200,
  depth: 40,
  wall: 2,
  style: "flush",
  stripWidth: 8,
  wireHole: 5,
  diffuser: 1.2,
  clearance: 0.2,
  standoff: 15,
  overlay: "",
  overlayHeight: 40,
  bodyColor: "#1c1c1e",
  diffuserColor: "#f8f8f6",
  overlayColor: "#d6262e",
};

const BED_MM = 256;
const BACK = 2; // fundo da caixa
const LEDGE_W = 1.6; // apoio do difusor por dentro
const LEDGE_H = 1.6;
const CAP = 1.6; // tampa elevada
const LIP_W = 1.2;
const LIP_H = 4;
const POST_R = 4; // espaçadores da retroiluminada
const OVERLAY_T = 3;
const GAP = 10;
const STRIP_LOSS = 0.1; // fração do miolo onde a fita não passa

/** Ponto dentro de `cs` a pelo menos `r` da borda, perto de `near` (null se não couber). */
function spot(cs: CS, r: number, near: [number, number]): [number, number] | null {
  return scoped((k) => {
    const room = k(cs.offset(-r, "Round"));
    const pts = room.toPolygons().flat();
    if (!pts.length) return null;
    return pts.reduce((a, q) => (Math.hypot(q[0] - near[0], q[1] - near[1]) < Math.hypot(a[0] - near[0], a[1] - near[1]) ? q : a)) as [number, number];
  });
}

/** Uma caixa (letra) e as peças soltas dela. */
function letterBox(ctx: ModelCtx, L: CS, p: LedLetterParams, k: <D extends { delete(): void }>(o: D) => D): { body: Solid; loose: { name: string; solid: Solid }[] } {
  const { M } = ctx;
  const inner = k(L.offset(-p.wall, "Round"));
  if (inner.isEmpty()) throw new Error("A letra é fina demais para a parede: aumente a altura ou diminua a parede.");
  const wall = k(L.subtract(inner));
  const b = L.bounds();
  const bottom: [number, number] = [(b.min[0] + b.max[0]) / 2, b.min[1]];
  const ledge = (z: number) => k(k(k(inner.subtract(k(inner.offset(-LEDGE_W, "Round")))).extrude(LEDGE_H)).translate([0, 0, z]));
  const fitted = k(inner.offset(-p.clearance, "Round"));
  let body = k(wall.extrude(p.depth));
  const loose: { name: string; solid: Solid }[] = [];
  const diffuser = () => ({ name: "Difusor", solid: k(fitted.extrude(p.diffuser)) });

  if (p.style === "halo") {
    // face fechada (imprime de cara na mesa), costas abertas e espaçadores que afastam a letra da parede
    body = k(body.add(k(L.extrude(p.diffuser + 0.8))));
    const posts = [b.min[0], b.max[0]].map((x) => spot(inner, POST_R + 0.5, [x, (b.min[1] + b.max[1]) / 2])).filter((q): q is [number, number] => !!q);
    for (const q of posts) body = k(body.add(k(k(M.Manifold.cylinder(p.depth + p.standoff, POST_R, POST_R, 24)).translate([q[0], q[1], 0]))));
  } else {
    if (p.style !== "double") body = k(body.add(k(L.extrude(BACK))));
    if (p.style === "flush" || p.style === "double") {
      body = k(body.add(ledge(p.depth - p.diffuser - LEDGE_H)));
      loose.push(diffuser());
    }
    if (p.style === "double") {
      body = k(body.add(ledge(p.diffuser)));
      loose.push(diffuser());
      // fio sai por baixo, pela parede
      const notch = k(k(M.Manifold.cube([p.wireHole, p.wall * 4, p.wireHole], true)).translate([bottom[0], bottom[1], p.depth / 2]));
      body = k(body.subtract(notch));
    } else {
      const at = spot(inner, p.wireHole / 2 + 1, bottom);
      if (at) body = k(body.subtract(k(k(M.Manifold.cylinder(BACK * 3, p.wireHole / 2, p.wireHole / 2, 24)).translate([at[0], at[1], -BACK]))));
    }
    if (p.style === "raised") {
      // tampa difusora por cima da parede, com lábio que entra na caixa (imprime com a tampa na mesa)
      const lip = k(k(k(fitted.subtract(k(fitted.offset(-LIP_W, "Round")))).extrude(LIP_H)).translate([0, 0, CAP]));
      loose.push({ name: "Tampa", solid: k(k(L.extrude(CAP)).add(lip)) });
    }
  }
  return { body, loose };
}

/**
 * Letra caixa para LED: letra (ou palavra, uma caixa por letra) oca com parede, no contorno da letra. Estilos:
 * face rente (difusor encaixado no topo), retroiluminada (face fechada, luz na parede, com espaçadores), tampa
 * elevada (tampa difusora com lábio) e face dupla (difusor na frente e atrás). Parte em pedaços que cabem na mesa.
 */
export function buildLedLetter(ctx: ModelCtx, p: LedLetterParams): ModelOutput {
  const { M, text, art } = ctx;
  return scoped((k) => {
    const raw = art ?? text(p.text, p.height);
    if (!raw || raw.isEmpty()) throw new MissingInput("Digite a letra ou palavra, ou envie um desenho.");
    const shape = k(fitInto(art ? raw : k(raw), 1e6, p.height, 0));
    const letters = k(outerOnly(M, shape)).decompose().map(k); // os furos da letra (miolo do A) ficam para a caixa
    const warnings: string[] = [];
    const models: Model[] = [];
    let cutParts = 0;
    for (const [i, outer] of letters.entries()) {
      const L = k(outer.intersect(shape));
      const { body, loose } = letterBox(ctx, L, p, k);
      const pieces = splitToBed(M, body, BED_MM).map(k);
      if (pieces.length > 1) cutParts += pieces.length;
      pieces.forEach((s, j) => models.push({ name: `Caixa ${i + 1}${pieces.length > 1 ? `.${j + 1}` : ""}`, parts: [{ name: "Caixa", color: p.bodyColor, mesh: solidMesh(s) }] }));
      for (const l of loose)
        splitToBed(M, l.solid, BED_MM).map(k).forEach((s, j, all) =>
          models.push({ name: `${l.name} ${i + 1}${all.length > 1 ? `.${j + 1}` : ""}`, parts: [{ name: l.name, color: p.diffuserColor, mesh: solidMesh(s) }] }),
        );
      // a fita precisa passar pelo miolo: onde o traço por dentro é mais estreito que ela, avisa
      const inner = k(L.offset(-p.wall, "Round"));
      const opened = k(k(inner.offset(-p.stripWidth / 2, "Round")).offset(p.stripWidth / 2, "Round"));
      if ((inner.area() - opened.area()) / inner.area() > STRIP_LOSS && !warnings.some((w) => w.includes("fita")))
        warnings.push(`A fita de ${p.stripWidth} mm não passa nos traços mais finos: aumente a letra, diminua a parede ou use fita mais estreita.`);
    }
    if (p.overlay.trim()) {
      const name = text(p.overlay, p.overlayHeight);
      if (name) models.push({ name: p.overlay.trim(), parts: [{ name: "Nome", color: p.overlayColor, mesh: slab(k(name), OVERLAY_T) }] });
    }
    // letras inteiras ficam no lugar (formam a palavra); o resto vai em fila embaixo
    const inPlace = (m: Model) => /^Caixa \d+$/.test(m.name);
    let y = (modelsBounds(models.filter(inPlace)) ?? modelsBounds(models)!).min[1] - GAP;
    const laid = models.map((m) => {
      if (inPlace(m)) return m;
      const b = modelsBounds([m])!;
      const moved = moveModel(m, -(b.min[0] + b.max[0]) / 2, y - b.max[1]);
      y -= b.max[1] - b.min[1] + GAP;
      return moved;
    });
    if (cutParts) warnings.push(`Maior que a mesa de ${BED_MM} mm: a caixa saiu em ${cutParts} partes para colar.`);
    warnings.push(p.style === "halo" ? "Retroiluminada: cole a fita na parede interna virada para trás; a luz sai pela parede de fundo." : "Use filamento branco no difusor, com 2 a 3 camadas para a luz espalhar sem mostrar os pontos do LED.");
    return { models: laid, warnings };
  });
}
