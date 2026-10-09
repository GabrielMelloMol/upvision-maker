/*
 * Lugares offline do mapa estelar (#196): os 5.570 municípios do IBGE (com UF e fuso) e as cidades do mundo com mais de
 * 15 mil habitantes (GeoNames). As listas ficam em src/data/places (geradas por scripts/build-places.mjs) e só são
 * carregadas quando a busca é usada.
 */
export type PlaceSource = "br" | "world" | "osm";
export type FoundPlace = {
  name: string;
  /** UF (Brasil) ou país. */
  region: string;
  lat: number;
  lon: number;
  tz: string;
  source: PlaceSource;
  /** Texto para a lista e a legenda: "Campinas, SP". */
  label: string;
};
export type PlaceIndex = { brasil: number; mundo: number; timeZones: string[]; entries: Entry[] };
type Entry = FoundPlace & { key: string; alt: string; rank: number; regionKey: string };

/** Minúsculas, sem acento nem pontuação. */
export const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const MIN_QUERY = 2;
const CAPITAL_RANK = 1e7;
const BR_RANK = 1e4;
const SHORT_REGION = 3; // "sp", "pb": sigla de estado

let cached: Promise<PlaceIndex> | null = null;

/** Nomes de países em português; sem suporte do Intl, fica a sigla de duas letras. */
function countryNames(): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames(["pt-BR"], { type: "region" });
  } catch {
    return null;
  }
}

function parse(raw: string, source: "br" | "world", countries: Intl.DisplayNames | null): { tzs: string[]; entries: Entry[] } {
  const [head, ...rows] = raw.trim().split("\n");
  const tzs = head.split("|");
  const entries = rows.map((line): Entry => {
    const c = line.split("|");
    const [name, region, lat, lon, tz] = c;
    const world = source === "world";
    const country = world ? (countries?.of(region) ?? region) : region;
    const alt = world ? (c[6] ?? "") : "";
    return {
      name,
      region: country,
      lat: Number(lat),
      lon: Number(lon),
      tz: tzs[Number(tz)],
      source,
      label: world ? `${name}, ${country}` : `${name}, ${region}`,
      key: fold(name),
      alt: fold(alt),
      regionKey: fold(country),
      rank: world ? Number(c[5]) || 0 : c[5] === "1" ? CAPITAL_RANK : BR_RANK,
    };
  });
  return { tzs, entries };
}

/** Carrega (uma vez) e junta as listas do Brasil e do mundo. */
export function loadPlaces(): Promise<PlaceIndex> {
  cached ??= (async () => {
    const [br, world] = await Promise.all([import("../../data/places/brasil.txt?raw"), import("../../data/places/mundo.txt?raw")]);
    const a = parse(br.default, "br", null), b = parse(world.default, "world", countryNames());
    return { brasil: a.entries.length, mundo: b.entries.length, timeZones: [...new Set([...a.tzs, ...b.tzs])], entries: [...a.entries, ...b.entries] };
  })();
  return cached;
}

/** Cidades que casam com o texto: todas as palavras do texto começam uma palavra do nome (ou são a sigla do estado/país). */
export function searchPlaces(index: PlaceIndex, query: string, limit = 8): FoundPlace[] {
  const q = fold(query);
  if (q.length < MIN_QUERY) return [];
  const tokens = q.split(" ");
  const scored: { e: Entry; score: number }[] = [];
  for (const e of index.entries) {
    const words = `${e.key} ${e.alt}`.split(" ");
    let ok = true;
    for (const t of tokens) {
      if (words.some((w) => w.startsWith(t))) continue;
      if (t.length <= SHORT_REGION && e.source === "br" && e.regionKey === t) continue; // sigla da UF
      if (e.regionKey.split(" ").some((w) => w.startsWith(t)) && t.length > SHORT_REGION) continue; // país
      ok = false;
      break;
    }
    if (!ok) continue;
    const score = e.key === q || e.alt === q ? 0 : e.key.startsWith(q) || e.alt.startsWith(q) ? 1 : 2;
    scored.push({ e, score });
  }
  scored.sort((a, b) => a.score - b.score || b.e.rank - a.e.rank || a.e.name.localeCompare(b.e.name, "pt-BR") || a.e.region.localeCompare(b.e.region));
  return scored.slice(0, limit).map(({ e }) => ({ name: e.name, region: e.region, lat: e.lat, lon: e.lon, tz: e.tz, source: e.source, label: e.label }));
}
