/**
 * Potência MÉDIA imprimindo PLA (não a máxima da fonte, que é 2–3× maior).
 * "oficial": publicado pelo fabricante (link em `ref`). "estimativa": fabricante não publica média; valor pela
 * classe da máquina (tamanho da mesa, fechada ou aberta) e medições de usuários — confira com tomada medidora.
 */
export type CatalogPrinter = { id: string; brand: string; model: string; watts: number; source: "oficial" | "estimativa"; ref?: string };

const BAMBU = "https://wiki.bambulab.com/en/general/power-consumption";
const PRUSA = "https://help.prusa3d.com/article/faq-frequently-asked-questions_1932"; // "MK-series … 80 W when printing generic PLA"

const official = (id: string, brand: string, model: string, watts: number, ref: string): CatalogPrinter => ({ id, brand, model, watts, source: "oficial", ref });
const est = (id: string, brand: string, model: string, watts: number): CatalogPrinter => ({ id, brand, model, watts, source: "estimativa" });

export const PRINTER_CATALOG: CatalogPrinter[] = [
  official("bambu-a1", "Bambu Lab", "A1", 95, BAMBU),
  official("bambu-a1-mini", "Bambu Lab", "A1 mini", 80, BAMBU),
  official("bambu-p1p", "Bambu Lab", "P1P", 110, BAMBU),
  official("bambu-p1s", "Bambu Lab", "P1S", 105, BAMBU),
  official("bambu-x1c", "Bambu Lab", "X1 Carbon", 105, BAMBU),
  official("bambu-x1e", "Bambu Lab", "X1E", 185, BAMBU),
  official("bambu-p2s", "Bambu Lab", "P2S", 200, BAMBU),
  official("bambu-h2s", "Bambu Lab", "H2S", 200, BAMBU),
  official("bambu-h2d", "Bambu Lab", "H2D", 197, BAMBU),
  official("prusa-mk4s", "Prusa", "MK4S", 80, PRUSA),
  official("prusa-mk4", "Prusa", "MK4", 80, PRUSA),
  official("prusa-mk3s", "Prusa", "MK3S+", 80, PRUSA),
  est("prusa-core-one", "Prusa", "Core One", 90),
  est("prusa-mini", "Prusa", "MINI+", 60),
  est("creality-ender3-v3-se", "Creality", "Ender-3 V3 SE", 100),
  est("creality-ender3-v3-ke", "Creality", "Ender-3 V3 KE", 110),
  est("creality-ender3-v3", "Creality", "Ender-3 V3", 110),
  est("creality-ender3", "Creality", "Ender-3 / Pro / V2", 110),
  est("creality-k1", "Creality", "K1", 120),
  est("creality-k1c", "Creality", "K1C", 120),
  est("creality-k1-max", "Creality", "K1 Max", 180),
  est("creality-k2-plus", "Creality", "K2 Plus", 200),
  est("elegoo-neptune4", "Elegoo", "Neptune 4", 110),
  est("elegoo-neptune4-pro", "Elegoo", "Neptune 4 Pro", 120),
  est("elegoo-neptune4-max", "Elegoo", "Neptune 4 Max", 200),
  est("elegoo-centauri-carbon", "Elegoo", "Centauri Carbon", 110),
  est("anycubic-kobra3", "Anycubic", "Kobra 3", 110),
  est("anycubic-kobra2-neo", "Anycubic", "Kobra 2 Neo", 100),
  est("anycubic-kobra-s1", "Anycubic", "Kobra S1", 120),
  est("sovol-sv06", "Sovol", "SV06", 90),
  est("sovol-sv06-plus", "Sovol", "SV06 Plus", 130),
  est("sovol-sv08", "Sovol", "SV08", 150),
  est("flashforge-ad5m", "Flashforge", "Adventurer 5M", 100),
  est("flashforge-ad5m-pro", "Flashforge", "Adventurer 5M Pro", 110),
  est("qidi-q1-pro", "Qidi", "Q1 Pro", 130),
  est("qidi-xplus3", "Qidi", "X-Plus 3", 140),
  est("voron-0", "Voron / Klipper", "Voron 0 (120 mm)", 60),
  est("voron-24-350", "Voron / Klipper", "Voron 2.4 / Trident (350 mm)", 200),
  est("klipper-235", "Voron / Klipper", "Klipper genérica (mesa 235 mm)", 120),
];

export const PRINTER_BRANDS = [...new Set(PRINTER_CATALOG.map((p) => p.brand))];

export const printerLabel = (p: CatalogPrinter) => (p.brand.includes("/") ? p.model : `${p.brand} ${p.model}`);

export const printerSourceText = (p: CatalogPrinter) => (p.source === "oficial" ? `dado oficial da ${p.brand}` : "estimativa — o fabricante não publica a média; confira com tomada medidora");

export const MEASURE_TIP = "Para o valor exato: ligue a impressora numa tomada medidora, imprima 1 hora em PLA e anote os Wh gastos — esse número é a potência média em W.";

/** Linha do catálogo: "95 W · dado oficial" ou "≈120 W · estimativa". */
export const printerSubtitle = (p: CatalogPrinter) => (p.source === "oficial" ? `${p.watts} W · dado oficial` : `≈${p.watts} W · estimativa`);

/** Impressora do catálogo com este nome ("Bambu Lab A1" ou só "A1"), para mostrar os watts de referência. */
export const findCatalogPrinter = (name: string) => {
  const n = name.trim().toLowerCase();
  return n ? PRINTER_CATALOG.find((p) => printerLabel(p).toLowerCase() === n || p.model.toLowerCase() === n) : undefined;
};

/** Valores do formulário de impressora a partir do catálogo. */
export function printerFromCatalog(id: string): { name: string; watts: string } {
  const p = PRINTER_CATALOG.find((x) => x.id === id);
  if (!p) throw new Error(`Impressora fora do catálogo: ${id}`);
  return { name: printerLabel(p), watts: String(p.watts) };
}

export const PRINTER_CATALOG_ITEMS = PRINTER_CATALOG.map((p) => ({ id: p.id, group: p.brand, title: p.model, subtitle: printerSubtitle(p), keywords: p.brand }));
