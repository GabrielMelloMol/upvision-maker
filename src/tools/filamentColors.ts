import { filaments as filamentsRepo } from "../db/repo";
import type { Db } from "../db/types";
import type { Filament } from "../domain/entities";
import { colorSwatch } from "../ui/ColorDots";

export const loadFilaments = (db: Db) => filamentsRepo.list(db);

export type FilamentColor = { hex: string; label: string };

/** Filamentos cadastrados com cor reconhecível (nome comum ou hex), sem repetir a cor. */
export function filamentColors(list: Filament[]): FilamentColor[] {
  const out = new Map<string, FilamentColor>();
  for (const f of list) {
    const hex = colorSwatch(f.color);
    if (!hex || hex === "transparent" || out.has(hex.toLowerCase())) continue;
    out.set(hex.toLowerCase(), { hex: hex.toLowerCase(), label: [f.material, f.color, f.brand && `(${f.brand})`].filter(Boolean).join(" ") });
  }
  return [...out.values()];
}
