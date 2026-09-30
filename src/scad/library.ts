import { modelVariants } from "../db/modelVariantsRepo";
import type { Db } from "../db/types";
import type { Params } from "../tools/models/fields";

/**
 * "Meus modelos" OpenSCAD (#96/#97): .scad + valores + licença na tabela de variações (#26), que entra no backup.
 * `OWN_LICENSE` = modelo da própria pessoa (ex.: virou modelo no Pedir à IA).
 */
export const LIBRARY_ID = "scad";
export const OWN_LICENSE = { id: "own", label: "Meu (feito por mim ou no Pedir à IA)", verdict: { sell: "yes" as const, text: "Modelo seu: pode vender a peça." } };

export type SavedScad = { name: string; source: string; license: string; credit: string; values: Params };

export async function saveScad(db: Db, s: SavedScad): Promise<number> {
  const { name, ...data } = s;
  return modelVariants.create(db, { modelId: LIBRARY_ID, label: name.trim().slice(0, 60) || "Modelo OpenSCAD", data: JSON.stringify(data), createdAt: new Date().toISOString() });
}

export function readSaved(label: string, data: string): SavedScad {
  const d = JSON.parse(data) as Partial<SavedScad>;
  if (typeof d.source !== "string") throw new Error("Modelo guardado sem o código .scad.");
  return { name: label, source: d.source, license: d.license ?? "", credit: d.credit ?? "", values: d.values ?? {} };
}

/** Abre um modelo na tela OpenSCAD personalizável ao navegar para ela (ex.: vindo do Pedir à IA). */
let pending: SavedScad | null = null;
export const openScadNext = (s: SavedScad) => {
  pending = s;
};
export const takeScadHandoff = () => {
  const s = pending;
  pending = null;
  return s;
};
