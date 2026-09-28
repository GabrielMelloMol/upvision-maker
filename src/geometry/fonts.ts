import opentype, { type Font } from "opentype.js";
import dancing from "@fontsource/dancing-script/files/dancing-script-latin-700-normal.woff?url";
import fredoka from "@fontsource/fredoka/files/fredoka-latin-600-normal.woff?url";
import hanken from "@fontsource/hanken-grotesk/files/hanken-grotesk-latin-800-normal.woff?url";
import lobster from "@fontsource/lobster/files/lobster-latin-400-normal.woff?url";
import pacifico from "@fontsource/pacifico/files/pacifico-latin-400-normal.woff?url";
import playfair from "@fontsource/playfair-display/files/playfair-display-latin-800-normal.woff?url";

/** Fontes embutidas no app (todas SIL Open Font License, via Fontsource). */
export const FONTS = [
  { id: "hanken", label: "Moderna (Hanken Grotesk)", css: "'Hanken Grotesk'", url: hanken },
  { id: "fredoka", label: "Arredondada (Fredoka)", css: "'Fredoka'", url: fredoka },
  { id: "pacifico", label: "Cursiva marcante (Pacifico)", css: "'Pacifico'", url: pacifico },
  { id: "lobster", label: "Cursiva retrô (Lobster)", css: "'Lobster'", url: lobster },
  { id: "dancing", label: "Cursiva leve (Dancing Script)", css: "'Dancing Script'", url: dancing },
  { id: "playfair", label: "Elegante (Playfair Display)", css: "'Playfair Display'", url: playfair },
] as const;
export type FontId = (typeof FONTS)[number]["id"];

const cache = new Map<FontId, Promise<Font>>();

export function loadFont(id: FontId): Promise<Font> {
  let f = cache.get(id);
  if (!f) {
    const url = FONTS.find((x) => x.id === id)!.url;
    f = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => opentype.parse(b));
    f.catch(() => cache.delete(id));
    cache.set(id, f);
  }
  return f;
}
