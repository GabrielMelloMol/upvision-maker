import { filaments as filamentsRepo, loadSettings } from "../db/repo";
import type { Db } from "../db/types";
import type { Filament } from "../domain/entities";
import type { Ams } from "../domain/settings";
import { colorSwatch } from "../ui/ColorDots";

/** Um slot do AMS (#98): filamento cadastrado e a cor dele; vazio = null. */
export type AmsSlot = { slot: number; filament: Filament | null; hex: string | null; label: string };

const labelOf = (f: Filament) => [f.material, f.color, f.brand && `(${f.brand})`].filter(Boolean).join(" ");

/** Slots 1..N; filamento excluído do cadastro (id órfão) vira slot vazio. */
export function amsSlots(ams: Ams, list: Filament[]): AmsSlot[] {
  const byId = new Map(list.map((f) => [f.id, f]));
  return Array.from({ length: ams.slots }, (_, i) => {
    const id = ams.filaments[i] ?? null;
    const filament = id === null ? null : (byId.get(id) ?? null);
    const hex = filament ? colorSwatch(filament.color) : null;
    return { slot: i + 1, filament, hex: hex && hex !== "transparent" ? hex.toLowerCase() : null, label: filament ? labelOf(filament) : "vazio" };
  });
}

/** Slots com cor, na ordem do AMS: as cores que as ferramentas oferecem primeiro. */
export const loadedColors = (slots: AmsSlot[]) => slots.flatMap((s) => (s.hex ? [{ slot: s.slot, hex: s.hex, label: s.label }] : []));

export async function loadAms(db: Db): Promise<AmsSlot[]> {
  const [settings, list] = await Promise.all([loadSettings(db), filamentsRepo.list(db)]);
  return amsSlots(settings.ams, list);
}
