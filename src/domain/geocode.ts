/*
 * Busca de endereço online pelo Nominatim (OpenStreetMap), só quando a pessoa pede (#196). Política de uso do serviço:
 * no máximo 1 consulta por segundo, sem repetir a mesma, identificando o app (o navegador manda o Referer) e mostrando a
 * atribuição. A cidade da lista offline é sempre a alternativa.
 */
export type GeoResult = {
  /** Curto, para a legenda e a lista: "São Paulo, SP". */
  label: string;
  /** Endereço completo que o serviço devolveu. */
  detail: string;
  lat: number;
  lon: number;
};

export const OSM_ATTRIBUTION = "Endereços: © colaboradores do OpenStreetMap (nominatim.openstreetmap.org)";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const MIN_QUERY = 3;
const LIMIT = 6;
const MIN_INTERVAL_MS = 1100; // política de uso: 1 consulta por segundo
const TIMEOUT_MS = 8000;
const OFFLINE = "Não consegui buscar o endereço agora (sem internet ou o serviço está fora do ar). Use a cidade da lista.";

type Row = {
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
  address?: Record<string, string | undefined>;
};

const cache = new Map<string, GeoResult[]>();
let lastAt = 0;

/** Só para teste. */
export function resetGeocode(): void {
  cache.clear();
  lastAt = 0;
}

function shortLabel(r: Row): string {
  const a = r.address ?? {};
  const place = a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? a.suburb ?? (r.name || (r.display_name ?? "").split(",")[0]);
  const uf = (a["ISO3166-2-lvl4"] ?? "").startsWith("BR-") ? a["ISO3166-2-lvl4"]!.slice(3) : "";
  const region = uf || (a.country_code === "br" ? (a.state ?? "") : (a.country ?? a.state ?? ""));
  return [place, region].filter((x) => x && x !== place).length ? `${place}, ${region}` : place;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function searchAddress(query: string, fetchFn: typeof fetch = fetch): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) throw new Error(`Digite pelo menos ${MIN_QUERY} letras do endereço.`);
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const gap = lastAt + MIN_INTERVAL_MS - Date.now();
  lastAt = Date.now() + Math.max(0, gap);
  if (gap > 0) await wait(gap);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?${new URLSearchParams({ q, format: "jsonv2", addressdetails: "1", limit: String(LIMIT), "accept-language": "pt-BR" })}`;
    const r = await fetchFn(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(OFFLINE);
    const rows = (await r.json()) as Row[];
    const out = (Array.isArray(rows) ? rows : [])
      .map((x) => ({ label: shortLabel(x), detail: x.display_name ?? shortLabel(x), lat: Number(x.lat), lon: Number(x.lon) }))
      .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    cache.set(key, out);
    return out;
  } catch (e) {
    throw e instanceof Error && e.message === OFFLINE ? e : new Error(OFFLINE, { cause: e });
  } finally {
    clearTimeout(t);
  }
}
