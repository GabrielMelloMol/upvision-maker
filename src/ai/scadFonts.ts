import { CATALOG, FONT_CATEGORIES, type CatalogFont } from "../geometry/fontCatalog";

const DEFAULT_FONT = CATALOG.find((f) => f.id === "hanken")!;
const internal = (f: CatalogFont) => f.internal ?? f.family;

/** Fontes que o programa cita (mais a padrão): só essas são lidas e montadas no OpenSCAD. */
export function fontsUsed(programs: string[]): CatalogFont[] {
  const src = programs.join("\n").toLowerCase();
  return CATALOG.filter((f) => f === DEFAULT_FONT || src.includes(f.family.toLowerCase()) || src.includes(internal(f).toLowerCase()));
}

/**
 * fontconfig: o nome do catálogo (ex.: "Montserrat") aponta para o nome gravado no .ttf ("Montserrat Thin ExtraBold").
 * "Liberation Sans"/sans-serif, as padrão do OpenSCAD, e os nomes antigos do prompt apontam para a Hanken Grotesk.
 */
export function fontsConf(fonts: CatalogFont[]): string {
  const alias = (from: string, to: string) => `<alias><family>${from}</family><prefer><family>${to}</family></prefer></alias>`;
  const lines = [
    alias("Liberation Sans", internal(DEFAULT_FONT)),
    alias("sans-serif", internal(DEFAULT_FONT)),
    alias("Fredoka SemiBold", "Fredoka Light SemiBold"),
    ...fonts.filter((f) => f.internal).map((f) => alias(f.family, f.internal!)),
  ];
  return `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>/fonts</dir>\n${lines.join("\n")}</fontconfig>`;
}


/** Lista para o prompt da IA, por categoria: `Cursiva: "Pacifico", "Lobster"…`. */
export const scadFontList = () =>
  FONT_CATEGORIES.map((c) => `${c}: ${CATALOG.filter((f) => f.category === c).map((f) => `"${f.family}"`).join(", ")}`).join("\n  ");
