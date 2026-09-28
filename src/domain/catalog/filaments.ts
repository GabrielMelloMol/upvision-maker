import type { MATERIAL_TYPES } from "../entities";

/** Linha de filamento comum no Brasil. Peso do rolo padrão da linha; cores = as mais comuns (a lista completa muda com frequência). */
export type CatalogFilament = { id: string; brand: string; material: (typeof MATERIAL_TYPES)[number]; spoolG: number; colors: string[] };

const BASIC = ["Preto", "Branco", "Cinza", "Vermelho", "Azul", "Amarelo", "Verde", "Laranja"];
const FEW = ["Preto", "Branco", "Cinza"];

const line = (brand: string, slug: string, material: CatalogFilament["material"], colors = BASIC, spoolG = 1000): CatalogFilament => ({
  id: `${slug}-${material.toLowerCase()}`,
  brand,
  material,
  spoolG,
  colors,
});

export const FILAMENT_CATALOG: CatalogFilament[] = [
  ...(["PLA", "PETG", "ABS", "TPU"] as const).map((m) => line("Voolt3D", "voolt3d", m, m === "TPU" ? FEW : BASIC)),
  ...(["PLA", "PETG", "ABS", "TPU"] as const).map((m) => line("3D Fila", "3dfila", m, m === "TPU" ? FEW : BASIC)),
  ...(["PLA", "PETG", "ABS", "TPU"] as const).map((m) => line("GTMax3D", "gtmax3d", m, m === "TPU" ? FEW : BASIC)),
  ...(["PLA", "PETG", "ABS", "ASA", "TPU"] as const).map((m) => line("Bambu Lab", "bambu", m, m === "PLA" ? [...BASIC, "Rosa", "Roxo", "Bege", "Dourado"] : m === "TPU" ? FEW : BASIC)),
  ...(["PLA", "PETG", "ABS", "TPU"] as const).map((m) => line("Sunlu", "sunlu", m, m === "TPU" ? FEW : BASIC)),
  ...(["PLA", "PETG", "ABS", "TPU"] as const).map((m) => line("eSun", "esun", m, m === "TPU" ? FEW : BASIC)),
  ...(["PLA", "PETG", "ABS", "TPU"] as const).map((m) => line("Creality", "creality", m, m === "TPU" ? FEW : BASIC)),
];

const kg = (g: number) => (g % 1000 === 0 ? `${g / 1000} kg` : `${g} g`);

export const FILAMENT_CATALOG_ITEMS = FILAMENT_CATALOG.map((f) => ({
  id: f.id,
  group: f.brand,
  title: f.material,
  subtitle: `${f.material} · ${kg(f.spoolG)}`,
  keywords: `${f.brand} ${f.colors.join(" ")}`,
}));

/** Marca, material e peso do rolo; cor e preço ficam para ela escolher. */
export function filamentFromCatalog(id: string): { brand: string; material: string; spoolG: string } {
  const f = FILAMENT_CATALOG.find((x) => x.id === id);
  if (!f) throw new Error(`Filamento fora do catálogo: ${id}`);
  return { brand: f.brand, material: f.material, spoolG: String(f.spoolG) };
}
