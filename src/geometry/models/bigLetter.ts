import { modelsBounds } from "../bounds";
import type { CS } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { recessTexture, type BgTexture } from "./textures";
import { MissingInput, moveModel, plateStand, size2, slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type NameMode = "inlay" | "sunken" | "raised";
export type LetterFinish = "flat" | "resin" | "material";
export type LetterMount = "none" | "hang" | "stand";

export type BigLetterParams = {
  letter: string;
  letterFont: string; // fonte da letra (o nome usa a fonte principal)
  height: number; // altura da letra (mm)
  thickness: number;
  name: string;
  nameHeight: number;
  nameDx: number; // deslocamento do nome em relação ao centro da letra (mm)
  nameDy: number;
  nameAngle: number; // graus
  nameMode: NameMode;
  depth: number; // rebaixo (encaixado/rebaixado) ou relevo do nome
  nameThickness: number; // espessura da peça do nome encaixado
  clearance: number;
  finish: LetterFinish;
  wall: number; // borda para resina ou moldura do material
  resinHeight: number; // quanto a borda sobe acima da letra
  materialThickness: number; // EVA, feltro
  mount: LetterMount;
  /** Textura rebaixada no fundo (#50). */
  texture: BgTexture;
  texturePitch: number;
  textureDepth: number;
  letterColor: string;
  nameColor: string;
  accentColor: string; // borda, moldura, suporte
};

export const DEFAULT_BIG_LETTER: BigLetterParams = {
  letter: "A",
  letterFont: "anton",
  height: 150,
  thickness: 8,
  name: "Alice",
  nameHeight: 30,
  nameDx: 0,
  nameDy: 0,
  nameAngle: 0,
  nameMode: "inlay",
  depth: 1.5,
  nameThickness: 3,
  clearance: 0.2,
  finish: "flat",
  wall: 2.4,
  resinHeight: 2,
  materialThickness: 2,
  mount: "none",
  texture: "none",
  texturePitch: 6,
  textureDepth: 0.6,
  letterColor: "#f8f8f6",
  nameColor: "#d6262e",
  accentColor: "#c9a227",
};

const BED_MM = 256;
const GAP = 10;
const BACK_MM = 2; // fundo quando a letra leva material
const TEMPLATE_MM = 0.6; // molde para cortar o EVA/feltro
const HANG_R = 3; // furo de prego nas costas
const HANG_FROM_TOP = 0.15; // fração da altura, a partir do topo
const MIN_ON_LETTER = 0.5;
const TEX_MARGIN = 2; // faixa lisa em volta da textura // fração do nome que precisa ficar sobre a letra

/** Ponto mais central, na faixa perto do topo, onde cabe o furo de pendurar inteiro dentro da letra. */
function hangPoint(M: ModelCtx["M"], letter: CS): [number, number] | null {
  const b = letter.bounds();
  const y = b.max[1] - (b.max[1] - b.min[1]) * HANG_FROM_TOP;
  const cx = (b.min[0] + b.max[0]) / 2;
  const steps = 40;
  const xs = Array.from({ length: steps + 1 }, (_, i) => b.min[0] + ((b.max[0] - b.min[0]) * i) / steps).sort((a, c) => Math.abs(a - cx) - Math.abs(c - cx));
  return scoped((k) => {
    const room = k(letter.offset(-(HANG_R + 1.5), "Round"));
    for (const x of xs) {
      const dot = k(M.CrossSection.circle(0.1, 8).translate([x, y]));
      if (k(dot.intersect(room)).area() > 0) return [x, y];
    }
    return null;
  });
}

/**
 * Letra grande com nome: a letra (caractere ou desenho enviado) deitada, com o nome encaixado (peça separada),
 * rebaixado ou em relevo. Acabamentos: liso, borda para resina ou fundo para material (fundo com moldura + molde
 * para cortar o EVA). Pendurar (furo nas costas) ou suporte de mesa.
 */
export function buildBigLetter({ M, text, art, fontText }: ModelCtx, p: BigLetterParams): ModelOutput {
  return scoped((k) => {
    const raw = art ?? (fontText?.("letterFont") ?? text)([...p.letter.trim()][0] ?? "", p.height);
    if (!raw || raw.isEmpty()) throw new MissingInput("Digite a letra ou envie um desenho.");
    const letter = k(fitInto(art ? raw : k(raw), 1e6, p.height, 0));
    const [W, H] = size2(letter);
    const warnings: string[] = [];
    const letterPart = (cs: CS, h: number, z = 0): Part => ({ name: "Letra", color: p.letterColor, mesh: slab(cs, h, z) });

    const rawName = text(p.name, p.nameHeight);
    const name = rawName ? k(k(k(rawName).rotate(p.nameAngle)).translate([p.nameDx, p.nameDy])) : null;
    const onLetter = name ? k(name.intersect(letter)) : null;
    if (name && onLetter!.area() < name.area() * MIN_ON_LETTER) warnings.push("Boa parte do nome está fora da letra: mude a posição ou o tamanho do nome.");

    const extra: Model[] = [];
    let main: Part[];
    let top: number;
    if (p.finish === "material") {
      // fundo + moldura: o material (EVA/feltro) entra no miolo; o molde ajuda a cortar no formato certo
      const inner = k(letter.offset(-p.wall, "Round"));
      const frame = k(letter.subtract(inner));
      top = BACK_MM + p.materialThickness;
      main = [letterPart(letter, BACK_MM), { name: "Moldura", color: p.accentColor, mesh: slab(frame, p.materialThickness, BACK_MM) }];
      extra.push({ name: "Molde do material", parts: [{ name: "Molde do material", color: p.accentColor, mesh: slab(k(inner.offset(-p.clearance, "Round")), TEMPLATE_MM) }] });
      if (name) extra.push({ name: p.name.trim(), parts: [{ name: "Nome", color: p.nameColor, mesh: slab(name, p.nameThickness) }] });
    } else {
      top = p.thickness;
      let body = k(letter.extrude(p.thickness));
      // textura na face, longe da borda e do nome
      const texRegion = k(letter.offset(-TEX_MARGIN, "Round"));
      body = k(recessTexture(M, body, name ? k(texRegion.subtract(k(name.offset(TEX_MARGIN, "Round")))) : texRegion, p.thickness, p.texture, p.texturePitch, p.textureDepth));
      if (name && p.nameMode !== "raised") {
        const pocket = k(k(name.offset(p.nameMode === "inlay" ? p.clearance : 0, "Round")).intersect(letter));
        // nome todo fora da letra: bolso vazio (subtrair o vazio apagava a letra inteira, #128)
        if (!pocket.isEmpty()) body = k(body.subtract(k(k(pocket.extrude(p.depth + 0.01)).translate([0, 0, p.thickness - p.depth]))));
      }
      main = [{ name: "Letra", color: p.letterColor, mesh: solidMesh(body) }];
      if (name && p.nameMode === "raised") main.push({ name: "Nome", color: p.nameColor, mesh: slab(onLetter!, p.depth, p.thickness) });
      if (name && p.nameMode === "inlay") extra.push({ name: p.name.trim(), parts: [{ name: "Nome", color: p.nameColor, mesh: slab(name, p.nameThickness) }] });
      if (p.finish === "resin") {
        const ring = k(k(letter.offset(p.wall, "Round")).subtract(letter));
        main.push({ name: "Borda", color: p.accentColor, mesh: slab(ring, p.thickness + p.resinHeight) });
        warnings.push("Borda para resina: a resina fica por cima da letra, contida pela borda. Nivele a peça antes de despejar.");
      }
    }

    if (p.mount === "hang") {
      const at = hangPoint(M, letter);
      if (!at) warnings.push("Não achei lugar para o furo de pendurar perto do topo: use suporte ou cole um gancho.");
      else {
        // furo nas costas (a peça imprime de face para cima, então as costas ficam na mesa)
        const back = p.finish === "material" ? BACK_MM : p.thickness;
        const hole = k(k(M.Manifold.cylinder(back / 2, HANG_R, HANG_R, 32)).translate([at[0], at[1], 0]));
        const body = M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: main[0].mesh.positions, triVerts: main[0].mesh.indices }));
        main[0] = { ...main[0], mesh: solidMesh(k(k(body).subtract(hole))) };
      }
    }
    if (p.mount === "stand") extra.push(plateStand(M, W, top, p.accentColor, 0));

    // peças soltas ao lado da letra
    let x = W / 2 + GAP;
    const aside = extra.map((m) => {
      const b = modelsBounds([m])!;
      const moved = moveModel(m, x - b.min[0], 0);
      x += b.max[0] - b.min[0] + GAP;
      return moved;
    });
    if (Math.max(W, H) > BED_MM) warnings.push(`A letra tem ${Math.round(Math.max(W, H))} mm: passa da mesa de ${BED_MM} mm. Diminua a altura ou corte em partes.`);
    return { models: [{ name: p.letter.trim() || "Letra", parts: main }, ...aside], warnings };
  });
}
