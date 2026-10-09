import { Coins, HardDrive, Palette, Receipt, Store, Tag, Wrench, type LucideIcon } from "lucide-react";

/** Seções das Preferências (#179): uma lista à esquerda e só o painel da escolhida à direita. */
export const PREF_SECTIONS = [
  { id: "costs", label: "Custos da produção", icon: Coins },
  { id: "price", label: "Preço de venda", icon: Tag },
  { id: "losses", label: "Falhas, impostos e custos fixos", icon: Receipt },
  { id: "channels", label: "Canais de venda", icon: Store },
  { id: "look", label: "Aparência", icon: Palette },
  { id: "data", label: "Seus dados", icon: HardDrive },
  { id: "tools", label: "Ferramentas", icon: Wrench },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

export type PrefSection = (typeof PREF_SECTIONS)[number]["id"];
/** As seções que fazem parte do formulário com "Salvar preferências" (as outras salvam por conta própria). */
export const FORM_SECTIONS: readonly PrefSection[] = ["costs", "price", "losses", "channels"];

const KEY = "upvision.prefsSection";
const isSection = (v: unknown): v is PrefSection => PREF_SECTIONS.some((s) => s.id === v);

/** A última seção aberta neste computador (conveniência: se não houver armazenamento, abre a primeira). */
export function loadSection(): PrefSection {
  try {
    const v = localStorage.getItem(KEY);
    return isSection(v) ? v : "costs";
  } catch {
    return "costs";
  }
}

export function saveSection(s: PrefSection) {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    // sem armazenamento local: a escolha vale só nesta sessão
  }
}

export const sectionFromIntent = (v: unknown): PrefSection | null => (v && typeof v === "object" && isSection((v as { section?: unknown }).section) ? (v as { section: PrefSection }).section : null);

/** Em que seção está cada campo do formulário (para levar a pessoa ao erro). */
const FIELD_SECTION: Record<string, PrefSection> = {
  kwhPrice: "costs", laborHourCost: "costs", maintenancePct: "costs", targetProfitPerHour: "costs",
  multResale: "price", multConsumer: "price", marketplaceMarginPct: "price", minMarginPct: "price",
  failurePct: "losses", taxPct: "losses", productiveHoursMonth: "losses", packagingMaterialId: "losses", failureByMaterial: "losses",
  channels: "channels",
};
/** Seções que têm erro, na ordem da lista (erros sem campo conhecido ficam fora: aparecem no fim do formulário). */
export const sectionsWithErrors = (keys: string[]): PrefSection[] => PREF_SECTIONS.map((s) => s.id).filter((id) => keys.some((k) => FIELD_SECTION[k] === id));
