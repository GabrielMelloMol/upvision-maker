/**
 * Catálogo das fontes embutidas (src/assets/fonts, todas SIL OFL 1.1 — ver OFL.txt ao lado).
 * Sem dependências: o worker do OpenSCAD também lê daqui. Os arquivos só são baixados quando usados.
 */
export const FONT_CATEGORIES = ["Cursiva", "Grossa", "Divertida", "Infantil", "Elegante", "Retrô", "Serifada"] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];

export type CatalogFont = {
  id: string;
  /** Nome que a pessoa vê (e que o OpenSCAD aceita em text(font=…)). */
  family: string;
  category: FontCategory;
  /** Arquivo em src/assets/fonts. */
  file: string;
  /** Nome de família gravado no .ttf, quando difere de `family` (instâncias de fontes variáveis). */
  internal?: string;
};

// [id, família, categoria, arquivo, nome interno]. Os 6 primeiros ids vêm da versão antiga e não mudam.
const RAW: [string, string, FontCategory, string, string?][] = [
  ["hanken", "Hanken Grotesk", "Grossa", "hanken-grotesk-800", "Hanken Grotesk ExtraBold"],
  ["fredoka", "Fredoka", "Infantil", "fredoka-600", "Fredoka Light SemiBold"],
  ["pacifico", "Pacifico", "Cursiva", "pacifico-400"],
  ["lobster", "Lobster", "Cursiva", "lobster-400"],
  ["dancing", "Dancing Script", "Cursiva", "dancing-script-700"],
  ["playfair", "Playfair Display", "Elegante", "playfair-display-800", "Playfair Display ExtraBold"],
  ["great-vibes", "Great Vibes", "Cursiva", "great-vibes-400"],
  ["sacramento", "Sacramento", "Cursiva", "sacramento-400"],
  ["kaushan-script", "Kaushan Script", "Cursiva", "kaushan-script-400"],
  ["cookie", "Cookie", "Cursiva", "cookie-400"],
  ["grand-hotel", "Grand Hotel", "Cursiva", "grand-hotel-400"],
  ["damion", "Damion", "Cursiva", "damion-400"],
  ["courgette", "Courgette", "Cursiva", "courgette-400"],
  ["norican", "Norican", "Cursiva", "norican-400"],
  ["allura", "Allura", "Cursiva", "allura-400"],
  ["parisienne", "Parisienne", "Cursiva", "parisienne-400"],
  ["alex-brush", "Alex Brush", "Cursiva", "alex-brush-400"],
  ["oleo-script", "Oleo Script", "Cursiva", "oleo-script-700"],
  ["lobster-two", "Lobster Two", "Cursiva", "lobster-two-700"],
  ["mr-dafoe", "Mr Dafoe", "Cursiva", "mr-dafoe-400"],
  ["lily-script-one", "Lily Script One", "Cursiva", "lily-script-one-400"],
  ["bebas-neue", "Bebas Neue", "Grossa", "bebas-neue-400"],
  ["anton", "Anton", "Grossa", "anton-400"],
  ["archivo-black", "Archivo Black", "Grossa", "archivo-black-400"],
  ["russo-one", "Russo One", "Grossa", "russo-one-400"],
  ["black-ops-one", "Black Ops One", "Grossa", "black-ops-one-400"],
  ["poppins", "Poppins", "Grossa", "poppins-900", "Poppins Black"],
  ["montserrat", "Montserrat", "Grossa", "montserrat-800", "Montserrat Thin ExtraBold"],
  ["rubik-mono-one", "Rubik Mono One", "Grossa", "rubik-mono-one-400"],
  ["passion-one", "Passion One", "Grossa", "passion-one-900", "Passion One Black"],
  ["bangers", "Bangers", "Divertida", "bangers-400"],
  ["titan-one", "Titan One", "Divertida", "titan-one-400"],
  ["leckerli-one", "Leckerli One", "Divertida", "leckerli-one-400"],
  ["bungee", "Bungee", "Divertida", "bungee-400"],
  ["knewave", "Knewave", "Divertida", "knewave-400"],
  ["bagel-fat-one", "Bagel Fat One", "Divertida", "bagel-fat-one-400"],
  ["sigmar-one", "Sigmar One", "Divertida", "sigmar-one-400"],
  ["spicy-rice", "Spicy Rice", "Divertida", "spicy-rice-400"],
  ["baloo-2", "Baloo 2", "Infantil", "baloo-2-800", "Baloo 2 ExtraBold"],
  ["sniglet", "Sniglet", "Infantil", "sniglet-800"],
  ["comic-neue", "Comic Neue", "Infantil", "comic-neue-700"],
  ["bubblegum-sans", "Bubblegum Sans", "Infantil", "bubblegum-sans-400"],
  ["boogaloo", "Boogaloo", "Infantil", "boogaloo-400"],
  ["cinzel-decorative", "Cinzel Decorative", "Elegante", "cinzel-decorative-900", "Cinzel Decorative Black"],
  ["abril-fatface", "Abril Fatface", "Elegante", "abril-fatface-400"],
  ["cinzel", "Cinzel", "Elegante", "cinzel-900", "Cinzel Black"],
  ["press-start-2p", "Press Start 2P", "Retrô", "press-start-2p-400"],
  ["righteous", "Righteous", "Retrô", "righteous-400"],
  ["shrikhand", "Shrikhand", "Retrô", "shrikhand-400"],
  ["bowlby-one-sc", "Bowlby One SC", "Retrô", "bowlby-one-sc-400"],
  ["audiowide", "Audiowide", "Retrô", "audiowide-400"],
  ["rye", "Rye", "Retrô", "rye-400"],
  ["alfa-slab-one", "Alfa Slab One", "Serifada", "alfa-slab-one-400"],
  ["merriweather", "Merriweather", "Serifada", "merriweather-900", "Merriweather Light 18pt Black"],
  ["zilla-slab", "Zilla Slab", "Serifada", "zilla-slab-700"],
  ["bree-serif", "Bree Serif", "Serifada", "bree-serif-400"],
];

export const CATALOG: CatalogFont[] = RAW.map(([id, family, category, file, internal]) => ({ id, family, category, file: `${file}.ttf`, internal }));

/** URLs dos .ttf (o Vite só copia os arquivos; nada é baixado até alguém pedir). */
const URLS = import.meta.glob<string>("../assets/fonts/*.ttf", { query: "?url", import: "default", eager: true });
export const fontUrl = (file: string) => URLS[`../assets/fonts/${file}`];
