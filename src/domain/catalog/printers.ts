/**
 * Potência MÉDIA imprimindo PLA (não a máxima da fonte, que é 2–3× maior).
 * "oficial": publicado pelo fabricante (link em `ref`). "estimativa": fabricante não publica média; valor pela
 * classe da máquina (tamanho da mesa, fechada ou aberta) e medições de usuários — confira com tomada medidora.
 */
export type CatalogPrinter = {
  id: string;
  brand: string;
  model: string;
  watts: number;
  source: "oficial" | "estimativa";
  ref?: string;
  /** Gabinete fechado. */
  enclosed: boolean;
  /** Volume de impressão em mm ("256×256×256"; delta: "Ø300×410"). */
  volume: string;
  /** Bico de fábrica em mm, só quando a ficha do fabricante diz (sem o dado, o cadastro fica com 0,4). */
  nozzle?: number;
};

const BAMBU = "https://wiki.bambulab.com/en/general/power-consumption";
const PRUSA = "https://help.prusa3d.com/article/faq-frequently-asked-questions_1932"; // "MK-series … 80 W when printing generic PLA"
const PRUSA_CORE_ONE = "https://www.prusa3d.com/product/prusa-core-one/"; // "Average PLA printing ~90 W"
const PRUSA_CORE_ONE_L = "https://www.prusa3d.com/product/prusa-core-one-l-2/";
const SNAPMAKER_U1 = "https://wiki.snapmaker.com/en/FAQ/u1";
const OPEN = false;
const CLOSED = true;
// Pesquisa e raciocínio de cada estimativa: docs/estudos/impressoras-catalogo.md (#21).

const official = (id: string, brand: string, model: string, watts: number, enclosed: boolean, volume: string, ref: string): CatalogPrinter => ({ id, brand, model, watts, source: "oficial", ref, enclosed, volume });
const est = (id: string, brand: string, model: string, watts: number, enclosed: boolean, volume: string): CatalogPrinter => ({ id, brand, model, watts, source: "estimativa", enclosed, volume });

const CATALOG_ROWS: CatalogPrinter[] = [
  official("bambu-a1", "Bambu Lab", "A1", 95, OPEN, "256×256×256", BAMBU),
  official("bambu-a1-mini", "Bambu Lab", "A1 mini", 80, OPEN, "180×180×180", BAMBU),
  official("bambu-p1p", "Bambu Lab", "P1P", 110, OPEN, "256×256×256", BAMBU),
  official("bambu-p1s", "Bambu Lab", "P1S", 105, CLOSED, "256×256×256", BAMBU),
  official("bambu-x1c", "Bambu Lab", "X1 Carbon", 105, CLOSED, "256×256×256", BAMBU),
  official("bambu-x1e", "Bambu Lab", "X1E", 185, CLOSED, "256×256×256", BAMBU),
  official("bambu-p2s", "Bambu Lab", "P2S", 200, CLOSED, "256×256×256", BAMBU),
  official("bambu-h2s", "Bambu Lab", "H2S", 200, CLOSED, "340×320×340", BAMBU),
  official("bambu-h2d", "Bambu Lab", "H2D", 197, CLOSED, "350×320×325", BAMBU),
  official("bambu-x1", "Bambu Lab", "X1 (sem Carbon)", 105, CLOSED, "256×256×256", BAMBU),
  official("bambu-a2l", "Bambu Lab", "A2L", 145, OPEN, "330×320×325", BAMBU),
  official("bambu-x2d", "Bambu Lab", "X2D", 250, CLOSED, "256×256×260", BAMBU),
  official("bambu-h2c", "Bambu Lab", "H2C", 200, CLOSED, "325×320×325", BAMBU),
  official("prusa-mk4s", "Prusa", "MK4S", 80, OPEN, "250×210×220", PRUSA),
  official("prusa-mk4", "Prusa", "MK4", 80, OPEN, "250×210×220", PRUSA),
  official("prusa-mk3s", "Prusa", "MK3S+", 80, OPEN, "250×210×210", PRUSA),
  official("prusa-core-one", "Prusa", "Core One", 90, CLOSED, "250×220×270", PRUSA_CORE_ONE),
  est("prusa-mini", "Prusa", "MINI+", 60, OPEN, "180×180×180"),
  official("prusa-core-one-l", "Prusa", "Core One L", 90, CLOSED, "300×300×330", PRUSA_CORE_ONE_L),
  official("prusa-mk39", "Prusa", "MK3.9 / MK3.9S", 80, OPEN, "250×210×220", PRUSA),
  est("prusa-mk25s", "Prusa", "MK2.5S / MK3", 80, OPEN, "250×210×210"),
  est("prusa-xl", "Prusa", "XL (1 cabeça)", 180, CLOSED, "360×360×360"),
  est("prusa-xl-multi", "Prusa", "XL (2–5 cabeças)", 200, CLOSED, "360×360×360"),
  est("creality-ender3-v3-se", "Creality", "Ender-3 V3 SE", 100, OPEN, "220×220×250"),
  est("creality-ender3-v3-ke", "Creality", "Ender-3 V3 KE", 110, OPEN, "220×220×240"),
  est("creality-ender3-v3", "Creality", "Ender-3 V3", 110, OPEN, "220×220×250"),
  est("creality-ender3", "Creality", "Ender-3 / Pro / V2", 110, OPEN, "220×220×250"),
  est("creality-k1", "Creality", "K1", 120, CLOSED, "220×220×250"),
  est("creality-k1c", "Creality", "K1C", 120, CLOSED, "220×220×250"),
  est("creality-k1-max", "Creality", "K1 Max", 180, CLOSED, "300×300×300"),
  est("creality-k2-plus", "Creality", "K2 Plus", 200, CLOSED, "350×350×350"),
  est("creality-ender3-s1", "Creality", "Ender-3 S1 / S1 Pro", 115, OPEN, "220×220×270"),
  est("creality-ender3-s1-plus", "Creality", "Ender-3 S1 Plus", 170, OPEN, "300×300×300"),
  est("creality-ender3-v3-plus", "Creality", "Ender-3 V3 Plus", 170, OPEN, "300×300×330"),
  est("creality-ender3-max-neo", "Creality", "Ender-3 Max / Max Neo", 170, OPEN, "300×300×320"),
  est("creality-ender3-v2-neo", "Creality", "Ender-3 V2 Neo / Neo", 110, OPEN, "220×220×250"),
  est("creality-ender5-s1", "Creality", "Ender-5 S1", 120, OPEN, "220×220×280"),
  est("creality-ender5-pro", "Creality", "Ender-5 / Ender-5 Pro", 110, OPEN, "220×220×300"),
  est("creality-ender5-plus", "Creality", "Ender-5 Plus", 220, OPEN, "350×350×400"),
  est("creality-cr10", "Creality", "CR-10 / CR-10S / V2 / V3", 160, OPEN, "300×300×400"),
  est("creality-cr10-smart-pro", "Creality", "CR-10 Smart Pro / CR-10 SE", 170, OPEN, "300×300×400"),
  est("creality-cr10-max", "Creality", "CR-10 Max", 300, OPEN, "450×450×470"),
  est("creality-cr6-se", "Creality", "CR-6 SE", 110, OPEN, "235×235×250"),
  est("creality-cr-m4", "Creality", "CR-M4", 280, OPEN, "450×450×470"),
  est("creality-k1-se", "Creality", "K1 SE", 110, OPEN, "220×220×250"),
  est("creality-k2", "Creality", "K2 / K2 Combo", 140, CLOSED, "260×260×260"),
  est("creality-k2-pro", "Creality", "K2 Pro", 170, CLOSED, "300×300×300"),
  est("creality-hi", "Creality", "Hi / Hi Combo", 110, OPEN, "260×260×300"),
  est("creality-sparkx-i7", "Creality", "SPARKX i7", 105, OPEN, "260×260×255"),
  est("creality-sermoon-v1", "Creality", "Sermoon V1 / V1 Pro", 80, CLOSED, "175×175×165"),
  est("creality-sermoon-d3", "Creality", "Sermoon D3", 150, CLOSED, "280×260×310"),
  est("elegoo-neptune4", "Elegoo", "Neptune 4", 110, OPEN, "225×225×265"),
  est("elegoo-neptune4-pro", "Elegoo", "Neptune 4 Pro", 120, OPEN, "225×225×265"),
  est("elegoo-neptune4-max", "Elegoo", "Neptune 4 Max", 200, OPEN, "420×420×480"),
  est("elegoo-centauri-carbon", "Elegoo", "Centauri Carbon", 110, CLOSED, "256×256×256"),
  est("elegoo-neptune2", "Elegoo", "Neptune 2 / 2S", 100, OPEN, "220×220×250"),
  est("elegoo-neptune3", "Elegoo", "Neptune 3 / 3 Pro", 100, OPEN, "225×225×280"),
  est("elegoo-neptune3-plus", "Elegoo", "Neptune 3 Plus / 4 Plus", 170, OPEN, "320×320×400"),
  est("elegoo-neptune3-max", "Elegoo", "Neptune 3 Max", 230, OPEN, "420×420×500"),
  est("elegoo-centauri-carbon-2", "Elegoo", "Centauri Carbon 2", 120, CLOSED, "256×256×256"),
  est("elegoo-orangestorm-giga", "Elegoo", "OrangeStorm Giga", 450, OPEN, "800×800×1000"),
  est("anycubic-kobra3", "Anycubic", "Kobra 3", 110, OPEN, "250×250×260"),
  est("anycubic-kobra2-neo", "Anycubic", "Kobra 2 Neo", 100, OPEN, "220×220×250"),
  est("anycubic-kobra-s1", "Anycubic", "Kobra S1", 120, CLOSED, "250×250×250"),
  est("anycubic-kobra-x", "Anycubic", "Kobra X", 120, OPEN, "260×260×260"),
  est("anycubic-kobra3-v2", "Anycubic", "Kobra 3 V2", 110, OPEN, "250×250×260"),
  est("anycubic-kobra3-max", "Anycubic", "Kobra 3 Max", 230, OPEN, "420×420×500"),
  est("anycubic-kobra2", "Anycubic", "Kobra 2 / 2 Pro", 110, OPEN, "220×220×250"),
  est("anycubic-kobra2-plus", "Anycubic", "Kobra 2 Plus", 170, OPEN, "320×320×400"),
  est("anycubic-kobra2-max", "Anycubic", "Kobra 2 Max", 230, OPEN, "420×420×500"),
  est("anycubic-kobra", "Anycubic", "Kobra / Kobra Neo", 100, OPEN, "220×220×250"),
  est("anycubic-vyper", "Anycubic", "Vyper", 110, OPEN, "245×245×260"),
  est("anycubic-mega", "Anycubic", "i3 Mega / Mega S", 110, OPEN, "210×210×205"),
  est("anycubic-mega-x", "Anycubic", "Mega X", 170, OPEN, "300×300×305"),
  est("anycubic-chiron", "Anycubic", "Chiron", 250, OPEN, "400×400×450"),
  est("sovol-sv06", "Sovol", "SV06", 90, OPEN, "220×220×250"),
  est("sovol-sv06-plus", "Sovol", "SV06 Plus", 130, OPEN, "300×300×340"),
  est("sovol-sv08", "Sovol", "SV08", 150, OPEN, "350×350×345"),
  est("sovol-sv06-ace", "Sovol", "SV06 ACE", 100, OPEN, "220×220×250"),
  est("sovol-sv06-plus-ace", "Sovol", "SV06 Plus ACE", 140, OPEN, "300×300×340"),
  est("sovol-sv07", "Sovol", "SV07", 100, OPEN, "220×220×250"),
  est("sovol-sv07-plus", "Sovol", "SV07 Plus", 150, OPEN, "300×300×350"),
  est("sovol-sv08-max", "Sovol", "SV08 Max", 300, OPEN, "500×500×500"),
  est("sovol-zero", "Sovol", "Zero", 80, OPEN, "152×152×152"),
  est("sovol-sv04", "Sovol", "SV04 (IDEX)", 140, OPEN, "300×300×400"),
  est("sovol-sv01-pro", "Sovol", "SV01 Pro", 110, OPEN, "280×240×300"),
  est("flashforge-ad5m", "Flashforge", "Adventurer 5M", 100, OPEN, "220×220×220"),
  est("flashforge-ad5m-pro", "Flashforge", "Adventurer 5M Pro", 110, CLOSED, "220×220×220"),
  est("flashforge-ad5x", "Flashforge", "AD5X", 105, OPEN, "220×220×220"),
  est("flashforge-adventurer3", "Flashforge", "Adventurer 3", 60, CLOSED, "150×150×150"),
  est("flashforge-adventurer4", "Flashforge", "Adventurer 4", 90, CLOSED, "220×200×250"),
  est("flashforge-creator3-pro", "Flashforge", "Creator 3 Pro (IDEX)", 180, CLOSED, "300×250×200"),
  est("flashforge-creator4", "Flashforge", "Creator 4", 280, CLOSED, "400×350×500"),
  est("flashforge-guider3", "Flashforge", "Guider 3", 250, CLOSED, "300×250×340"),
  est("flashforge-finder3", "Flashforge", "Finder 3", 45, CLOSED, "190×195×200"),
  est("qidi-q1-pro", "Qidi", "Q1 Pro", 130, CLOSED, "245×245×240"),
  est("qidi-xplus3", "Qidi", "X-Plus 3", 140, CLOSED, "280×280×270"),
  est("qidi-plus4", "Qidi", "Plus4", 170, CLOSED, "305×305×280"),
  est("qidi-plus5", "Qidi", "Plus 5", 170, CLOSED, "305×305×280"),
  est("qidi-q2", "Qidi", "Q2", 130, CLOSED, "270×270×256"),
  est("qidi-max4", "Qidi", "Max4", 230, CLOSED, "390×390×340"),
  est("qidi-xmax3", "Qidi", "X-Max 3", 200, CLOSED, "325×325×315"),
  est("qidi-xsmart3", "Qidi", "X-Smart 3", 110, CLOSED, "175×180×170"),
  est("voron-0", "Voron / Klipper", "Voron 0 (120 mm)", 60, CLOSED, "120×120×120"),
  est("voron-24-350", "Voron / Klipper", "Voron 2.4 / Trident (350 mm)", 200, CLOSED, "350×350×340"),
  est("klipper-235", "Voron / Klipper", "Klipper genérica (mesa 235 mm)", 120, OPEN, "235×235×250"),
  est("voron-24-250", "Voron / Klipper", "Voron 2.4 / Trident (250 mm)", 150, CLOSED, "250×250×250"),
  est("voron-24-300", "Voron / Klipper", "Voron 2.4 / Trident (300 mm)", 170, CLOSED, "300×300×300"),
  est("klipper-300", "Voron / Klipper", "Klipper genérica (mesa 300 mm)", 170, OPEN, "300×300"),
  est("klipper-400", "Voron / Klipper", "Klipper genérica (mesa 400 mm)", 250, OPEN, "400×400"),
  official("snapmaker-u1", "Snapmaker", "U1", 118, OPEN, "270×270×270", SNAPMAKER_U1),
  est("snapmaker-j1", "Snapmaker", "J1 / J1s (IDEX)", 140, CLOSED, "300×200×200"),
  est("snapmaker-artisan", "Snapmaker", "Artisan (3-em-1)", 230, CLOSED, "400×400×400"),
  est("snapmaker-2-a350", "Snapmaker", "2.0 A350 / A350T", 200, OPEN, "320×350×330"),
  est("snapmaker-2-a250", "Snapmaker", "2.0 A250 / A250T", 150, OPEN, "230×250×235"),
  est("ratrig-vcore-300", "RatRig", "V-Core 3/4 (300 mm)", 180, OPEN, "300×300×300"),
  est("ratrig-vcore-400", "RatRig", "V-Core 3/4 (400 mm)", 250, OPEN, "400×400×400"),
  est("ratrig-vcore-500", "RatRig", "V-Core 3/4 (500 mm)", 330, OPEN, "500×500×500"),
  est("ratrig-vminion", "RatRig", "V-Minion", 90, OPEN, "180×180×180"),
  est("artillery-sidewinder-x1", "Artillery", "Sidewinder X1", 170, OPEN, "300×300×400"),
  est("artillery-sidewinder-x2", "Artillery", "Sidewinder X2", 170, OPEN, "300×300×400"),
  est("artillery-sidewinder-x3", "Artillery", "Sidewinder X3 Pro / Plus", 170, OPEN, "300×300×400"),
  est("artillery-sidewinder-x4-plus", "Artillery", "Sidewinder X4 Plus", 170, OPEN, "300×300×400"),
  est("artillery-sidewinder-x4-pro", "Artillery", "Sidewinder X4 Pro", 120, OPEN, "240×240×260"),
  est("artillery-genius", "Artillery", "Genius / Genius Pro", 110, OPEN, "220×220×250"),
  est("artillery-hornet", "Artillery", "Hornet", 100, OPEN, "220×220×250"),
  est("kingroon-kp3s", "Kingroon", "KP3S / KP3S Pro", 80, OPEN, "180×180×180"),
  est("kingroon-klp1", "Kingroon", "KLP1", 100, OPEN, "210×210×210"),
  est("twotrees-sk1", "Two Trees", "SK1", 120, OPEN, "256×256×256"),
  est("twotrees-sp5", "Two Trees", "SP-5", 150, OPEN, "300×300×330"),
  est("twotrees-bluer", "Two Trees", "Bluer / Sapphire Pro", 100, OPEN, "235×235×280"),
  est("ultimaker-s3", "UltiMaker", "S3", 110, OPEN, "230×190×200"),
  est("ultimaker-s5", "UltiMaker", "S5", 150, OPEN, "330×240×300"),
  est("ultimaker-s7", "UltiMaker", "S7", 150, OPEN, "330×240×300"),
  est("ultimaker-2plus-connect", "UltiMaker", "2+ Connect", 100, OPEN, "223×220×205"),
  est("ultimaker-3", "UltiMaker", "3 / 3 Extended", 110, OPEN, "215×215×200"),
  est("makerbot-method-x", "MakerBot", "Method / Method X", 200, CLOSED, "190×190×196"),
  est("makerbot-sketch", "MakerBot", "Sketch / Sketch Large", 90, CLOSED, "150×150×150"),
  est("makerbot-replicator-plus", "MakerBot", "Replicator+", 50, CLOSED, "295×195×165"),
  est("raise3d-pro3", "Raise3D", "Pro3 / Pro2", 250, CLOSED, "300×300×300"),
  est("raise3d-pro3-plus", "Raise3D", "Pro3 Plus / Pro2 Plus", 280, CLOSED, "300×300×605"),
  est("raise3d-e2", "Raise3D", "E2 (IDEX)", 200, CLOSED, "330×240×240"),
  est("tronxy-x5sa", "Tronxy", "X5SA / X5SA Pro", 170, OPEN, "330×330×400"),
  est("tronxy-x5sa-400", "Tronxy", "X5SA-400", 250, OPEN, "400×400×400"),
  est("tronxy-veho-600", "Tronxy", "Veho 600", 400, OPEN, "600×600×650"),
  est("geeetech-a10", "Geeetech", "A10 / A10 Pro", 110, OPEN, "220×220×260"),
  est("geeetech-a20", "Geeetech", "A20 / A20M", 150, OPEN, "255×255×255"),
  est("geeetech-mizar", "Geeetech", "Mizar / Mizar S", 110, OPEN, "255×255×260"),
  est("longer-lk4-pro", "Longer", "LK4 Pro", 110, OPEN, "220×220×250"),
  est("longer-lk5-pro", "Longer", "LK5 Pro", 150, OPEN, "300×300×400"),
  est("biqu-b1", "Biqu", "B1", 110, OPEN, "235×235×270"),
  est("biqu-hurakan", "Biqu", "Hurakan", 110, OPEN, "220×220×270"),
  est("biqu-bx", "Biqu", "BX", 150, OPEN, "250×250×250"),
  est("ankermake-m5", "AnkerMake", "M5", 120, OPEN, "235×235×250"),
  est("ankermake-m5c", "AnkerMake", "M5C", 110, OPEN, "220×220×250"),
  est("mingda-magician-x", "Mingda", "Magician X / X2", 110, OPEN, "230×230×260"),
  est("mingda-magician-max", "Mingda", "Magician Max", 230, OPEN, "400×400×400"),
  est("flsun-v400", "FLSUN", "V400", 170, OPEN, "Ø300×410"),
  est("flsun-sr", "FLSUN", "Super Racer (SR)", 150, OPEN, "Ø260×330"),
  est("flsun-t1", "FLSUN", "T1 / T1 Pro / T1 Max", 160, OPEN, "Ø260×330"),
  est("gtmax3d-core-a3v3", "GTMax3D", "Pro Core A3v3", 180, OPEN, "320×320×340"),
  est("gtmax3d-core-m4", "GTMax3D", "Pro Core M4", 280, OPEN, "410×410×440"),
  est("gtmax3d-core-gt4", "GTMax3D", "Pro Core GT4", 300, CLOSED, "400×400×400"),
  est("sethi3d-s3", "Sethi3D", "S3 / S3X", 160, OPEN, "270×270×320 (S3X 300×300×320)"),
  est("sethi3d-aip", "Sethi3D", "AiP", 100, OPEN, "220×210×200"),
  est("sethi3d-farm", "Sethi3D", "Farm", 110, OPEN, "240×240×240"),
  est("voolt3d-gi3", "Voolt3D", "Gi3", 110, OPEN, "≈200×200×200 (não confirmado)"),
];
/**
 * Bico de fábrica 0,4 mm: só onde o fabricante publica (Bambu Lab, toda a linha FDM, e as Prusa "oficiais" do catálogo).
 * As demais não têm o dado aqui e ficam sem `nozzle` (o cadastro assume 0,4 e a pessoa confere). Não é palpite.
 */
const FACTORY_NOZZLE_04 = (p: CatalogPrinter) => p.brand === "Bambu Lab" || (p.brand === "Prusa" && p.source === "oficial");
export const PRINTER_CATALOG: CatalogPrinter[] = CATALOG_ROWS.map((p) => (FACTORY_NOZZLE_04(p) ? { ...p, nozzle: 0.4 } : p));


export const PRINTER_BRANDS = [...new Set(PRINTER_CATALOG.map((p) => p.brand))];

export const printerLabel = (p: CatalogPrinter) => (p.brand.includes("/") ? p.model : `${p.brand} ${p.model}`);

export const printerSourceText = (p: CatalogPrinter) => (p.source === "oficial" ? `dado oficial da ${p.brand}` : "estimativa — o fabricante não publica a média; confira com tomada medidora");

export const MEASURE_TIP = "Para o valor exato: ligue a impressora numa tomada medidora, imprima 1 hora em PLA e anote os Wh gastos — esse número é a potência média em W.";

/** Linha do catálogo: "95 W · dado oficial · aberta · 256×256×256 mm". */
export const printerSubtitle = (p: CatalogPrinter) =>
  `${p.source === "oficial" ? `${p.watts} W · dado oficial` : `≈${p.watts} W · estimativa`} · ${p.enclosed ? "fechada" : "aberta"} · ${p.volume} mm`;

/** "Ender-3 V3 SE" também acha por "ender3" (busca sem hífen/espaço). */
const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Impressora do catálogo com este nome ("Bambu Lab A1" ou só "A1"), para mostrar os watts de referência. */
export const findCatalogPrinter = (name: string) => {
  const n = name.trim().toLowerCase();
  return n ? PRINTER_CATALOG.find((p) => printerLabel(p).toLowerCase() === n || p.model.toLowerCase() === n) : undefined;
};

/** Valores do formulário de impressora a partir do catálogo. */
export function printerFromCatalog(id: string): { name: string; watts: string; nozzle?: string } {
  const p = PRINTER_CATALOG.find((x) => x.id === id);
  if (!p) throw new Error(`Impressora fora do catálogo: ${id}`);
  return { name: printerLabel(p), watts: String(p.watts), ...(p.nozzle ? { nozzle: String(p.nozzle).replace(".", ",") } : {}) };
}

export const PRINTER_CATALOG_ITEMS = PRINTER_CATALOG.map((p) => ({ id: p.id, group: p.brand, title: p.model, subtitle: printerSubtitle(p), keywords: `${p.brand} ${compact(p.model)} ${compact(p.brand + p.model)}` }));
