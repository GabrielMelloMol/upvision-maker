import type { Filament } from "../domain/entities";
import { deltaE2000 } from "../geometry/colorMatch";
import { colorSwatch } from "../ui/ColorDots";

/** Diferença (ΔE00) até onde um filamento cadastrado "parece com" a cor (10 já é uma diferença visível lado a lado). */
const SIMILAR_DE = 22;

/** O filamento cadastrado mais parecido com a cor, ou nada se nenhum chega perto. */
export function suggestFilament(hex: string, stock: Filament[]): { filament: Filament; swatch: string; de: number } | null {
  let best: { filament: Filament; swatch: string; de: number } | null = null;
  for (const f of stock) {
    const swatch = colorSwatch(f.color);
    if (!swatch || !/^#[0-9a-f]{6}$/i.test(swatch)) continue;
    const de = deltaE2000(hex, swatch);
    if (de <= SIMILAR_DE && (!best || de < best.de)) best = { filament: f, swatch, de };
  }
  return best;
}

export const filamentLabel = (f: Filament) => [f.material, f.color, f.brand].filter(Boolean).join(" ");
