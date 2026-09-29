import type { MedalShape } from "../geometry/medal";
import type { MedalDesign } from "../geometry/medalDesign";

export const SHAPES: [MedalShape | "free", string][] = [
  ["circle", "Redonda"],
  ["oval", "Oval"],
  ["hexagon", "Hexágono"],
  ["octagon", "Octógono"],
  ["star", "Estrela de 5 pontas"],
  ["star6", "Estrela de 6 pontas"],
  ["star8", "Estrela de 8 pontas"],
  ["shield", "Escudo"],
  ["shieldPoints", "Escudo com pontas"],
  ["heart", "Coração"],
  ["gear", "Engrenagem"],
  ["free", "Livre (contorno do desenho)"],
];

export const RIMS: [MedalDesign["rimStyle"], string][] = [
  ["simple", "Simples"],
  ["double", "Dupla"],
  ["serrated", "Serrilhada"],
  ["dotted", "Pontilhada"],
  ["laurel", "Louros"],
  ["none", "Sem borda"],
];

export const TEXTURES: [MedalDesign["texture"], string][] = [
  ["none", "Liso"],
  ["sunburst", "Raios de sol"],
  ["dots", "Pontilhado"],
  ["stripes", "Listras"],
];

export type PresetId = "championship" | "graduation" | "race" | "honor" | "birthday";

/** Presets: preenchem textos e estilo; o usuário ajusta depois. */
export const PRESETS: { id: PresetId; label: string; patch: Partial<MedalDesign> }[] = [
  {
    id: "championship",
    label: "Campeonato",
    patch: { shape: "circle", rimStyle: "double", texture: "sunburst", top: "CAMPEONATO", center: "CAMPEÃO", rank: "1º LUGAR", bottom: "2026", baseColor: "#f5c542", rimColor: "#b8860b", bgColor: "#e0b12f", textColor: "#1c1c1e" },
  },
  {
    id: "graduation",
    label: "Formatura",
    patch: { shape: "shield", rimStyle: "simple", texture: "none", top: "FORMATURA", center: "TURMA 2026", rank: "", bottom: "", baseColor: "#1e3a8a", rimColor: "#f5c542", textColor: "#f5c542", bgColor: "#1e40af" },
  },
  {
    id: "race",
    label: "Corrida",
    patch: { shape: "circle", rimStyle: "laurel", texture: "none", top: "CORRIDA DE RUA", center: "10K", centerSize: 12, rank: "CONCLUINTE", bottom: "2026", back: true, backText: "28/09/2026\nPARABÉNS!", baseColor: "#c0c0c0", rimColor: "#7a7a7a", textColor: "#1c1c1e" },
  },
  {
    id: "honor",
    label: "Honra ao mérito",
    patch: { shape: "star8", rimStyle: "serrated", texture: "stripes", top: "", center: "HONRA AO", rank: "MÉRITO", bottom: "", baseColor: "#b87333", rimColor: "#7b4a2a", bgColor: "#a0612a", textColor: "#f8f8f6" },
  },
  {
    id: "birthday",
    label: "Aniversário",
    patch: { shape: "heart", rimStyle: "dotted", texture: "dots", top: "", center: "PARABÉNS", rank: "15 ANOS", bottom: "", hanger: "ring", baseColor: "#f472b6", rimColor: "#f8f8f6", bgColor: "#f9a8d4", textColor: "#7e3fd6" },
  },
];

/** Lote: uma linha por pessoa, "Nome; colocação" (a colocação é opcional). */
export function parseBatch(s: string): { name: string; rank: string | null }[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, rank] = l.split(";").map((x) => x.trim());
      return { name, rank: rank || null };
    })
    .filter((x) => x.name);
}
