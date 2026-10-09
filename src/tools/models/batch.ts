import { bedMm } from "../../geometry/bed";
import { modelsBounds } from "../../geometry/bounds";
import { layoutOnPlate } from "../../geometry/keychain";
import type { Model } from "../../geometry/types";
import type { Params } from "./fields";

/** Campos de texto que mudam de cópia para cópia no lote (#76), na ordem em que vêm em cada linha. */
export const BATCH_FIELDS: Record<string, string[]> = {
  cake: ["line1", "line2"],
  stamp: ["text"],
  bookmark: ["text"],
  pen: ["text"],
  spinner: ["text"],
  nfc: ["text"],
  trophy: ["text", "baseText"],
  pencilTopper: ["text"],
  sign: ["text"],
  wordDecor: ["base", "word"],
  trophyElegant: ["text", "baseText"],
  gymKeychain: ["text"],
  articulatedName: ["text"],
  opener: ["text"],
  fridgeMagnet: ["text"],
  molle: ["text"],
  nfcJewelry: ["text", "text2"],
  petTag: ["name", "phone", "note"],
  profession: ["name", "role"],
  businessCard: ["name", "role", "phone"],
  mirror: ["top", "bottom"],
  snowflake: ["name"],
  bigLetter: ["letter", "name"],
  layeredSign: ["line1", "line2", "line3", "line4"],
  deskOrganizer: ["name"],
  cakeStand: ["name"],
  photoHolder: ["text"],
  stringArt: ["line1", "line2"],
  windowFrame: ["name"],
  gridBin: ["label"],
  lidBox: ["text"],
  alphabetCube: ["kit"],
  rpgDice: ["labels"],
  coaster: ["text"],
  phoneStand: ["text"],
};

export const MAX_COPIES = 30;
const GAP_MM = 5;

/** Uma cópia por linha não vazia; os campos vêm separados por ";" (faltando = vazio). */
export function parseBatch(s: string, keys: string[]): Params[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(";").map((x) => x.trim());
      return Object.fromEntries(keys.map((k, i) => [k, parts[i] ?? ""]));
    });
}

/**
 * Arruma as cópias na mesa: cada cópia (todas as peças dela) anda junta, em linhas, centralizadas.
 * `fits` = cabe na mesa da impressora escolhida (#119).
 */
export function layoutCopies(copies: { label: string; models: Model[] }[]): { models: Model[]; fits: boolean } {
  // cada cópia vira um bloco (um Model só) para arrumar; depois volta a ser as peças originais
  const blocks = copies.map((c) => ({ name: c.label, parts: c.models.flatMap((m) => m.parts) }));
  const placed = layoutOnPlate(blocks, bedMm() - 2 * GAP_MM, GAP_MM);
  const models = copies.flatMap((c, i) => {
    let at = 0;
    return c.models.map((m) => {
      const parts = placed[i].parts.slice(at, at + m.parts.length);
      at += m.parts.length;
      return { name: c.models.length > 1 ? `${c.label} · ${m.name}` : c.label, parts };
    });
  });
  const b = modelsBounds(models);
  return { models, fits: !b || (b.max[0] - b.min[0] <= bedMm() && b.max[1] - b.min[1] <= bedMm()) };
}
