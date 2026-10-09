import { useEffect, useMemo, useState } from "react";
import { OSM_ATTRIBUTION, searchAddress, type GeoResult } from "../../domain/geocode";
import { isDst, offsetLabel, tzAt, utcOffsetHours } from "../../geometry/models/placeTime";
import { loadPlaces, searchPlaces, type FoundPlace, type PlaceIndex } from "../../geometry/models/places";
import { CITIES } from "../../geometry/models/starSky";
import Alert from "../../ui/Alert";
import type { Params } from "./fields";

const SEARCH_DELAY_MS = 150;
const SHOWN = 8;
const COORD_DECIMALS = 4;
const round = (n: number) => Math.round(n * 10 ** COORD_DECIMALS) / 10 ** COORD_DECIMALS;
const br = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

type Props = { label: string; params: Params; patch: (next: Params) => void };

/** Nome mostrado no campo: o da cidade da lista antiga (rascunhos) ou o do lugar buscado. */
export const placeText = (p: Params): string => {
  const legacy = CITIES.find((c) => c[0] === p.city);
  return legacy ? legacy[1] : String(p.placeName ?? "") || `Lat. ${p.lat}, long. ${p.lon}`;
};

/** Fuso e horário de verão do lugar na data do modelo, para a pessoa conferir ("UTC−2 (horário de verão)"). */
export function zoneSummary(p: Params): { tz: string; text: string; lat: number; lon: number } | null {
  try {
    const legacy = CITIES.find((c) => c[0] === p.city);
    const lat = legacy ? legacy[2] : Number(p.lat), lon = legacy ? legacy[3] : Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const tz = !legacy && String(p.tz ?? "").trim() ? String(p.tz).trim() : tzAt(lat, lon);
    const when = { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute) };
    if (p.tzAuto === false) return { tz, lat, lon, text: `fuso manual ${offsetLabel(Number(p.utcOffset), false)}` };
    return { tz, lat, lon, text: `${offsetLabel(utcOffsetHours(tz, when), isDst(tz, when))}, automático pela localização e pela data` };
  } catch {
    return null;
  }
}

/**
 * Lugar do mapa estelar (#196): busca nas cidades do Brasil (IBGE) e do mundo (GeoNames), offline, e, a pedido, num
 * endereço completo pela internet (OpenStreetMap). Escolher preenche nome, latitude, longitude e fuso de uma vez.
 */
export default function PlaceField({ label, params, patch }: Props) {
  const shown = placeText(params);
  const [query, setQuery] = useState(shown);
  const [index, setIndex] = useState<PlaceIndex | null>(null);
  const [found, setFound] = useState<FoundPlace[]>([]);
  const [online, setOnline] = useState<GeoResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState(false); // a pessoa digitou: só então a lista aparece
  const [prevShown, setPrevShown] = useState(shown);
  if (prevShown !== shown) {
    // desfazer, variação ou rascunho trocaram o lugar
    setPrevShown(shown);
    setQuery(shown);
    setTyped(false);
  }

  useEffect(() => {
    if (!typed) return;
    const t = setTimeout(() => {
      void loadPlaces().then((ix) => {
        setIndex(ix);
        setFound(searchPlaces(ix, query, SHOWN));
      });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [query, typed]);

  const zone = useMemo(() => zoneSummary(params), [params]);
  const pick = (name: string, lat: number, lon: number, tz: string) => {
    patch({ city: "custom", placeName: name, lat: round(lat), lon: round(lon), tz });
    setTyped(false);
    setQuery(name);
    setFound([]);
    setOnline(null);
    setError("");
  };
  const searchOnline = async () => {
    setBusy(true);
    setError("");
    try {
      setOnline(await searchAddress(query));
    } catch (e) {
      setOnline(null);
      setError(e instanceof Error ? e.message : "Não consegui buscar o endereço.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="place-field span-2">
      <label>
        {label}
        <input
          type="search"
          value={query}
          placeholder="Ex.: Campinas, Av. Paulista 1000 ou Lisboa"
          autoComplete="off"
          onChange={(e) => {
            setTyped(true);
            setQuery(e.target.value);
            setOnline(null);
            setError("");
          }}
        />
      </label>
      {found.length > 0 && (
        <div className="place-results" role="group" aria-label="Lugares encontrados">
          {found.map((f) => (
            <button key={`${f.label}|${f.lat}|${f.lon}`} type="button" onClick={() => pick(f.label, f.lat, f.lon, f.tz)}>
              <span>{f.label}</span>
              <span className="muted">{f.source === "br" ? "Brasil" : "mundo"}</span>
            </button>
          ))}
        </div>
      )}
      {typed && index && found.length === 0 && query.trim().length >= 2 && <p className="hint">Nenhuma cidade com esse nome na lista. Tente o endereço pela internet.</p>}
      <div className="place-actions">
        <button type="button" className="secondary" disabled={busy || query.trim().length < 3} onClick={() => void searchOnline()}>
          {busy ? "Buscando…" : "Buscar endereço pela internet"}
        </button>
      </div>
      {error && <Alert kind="warn">{error}</Alert>}
      {online && (
        <div className="place-results" role="group" aria-label="Endereços encontrados">
          {online.length === 0 && <p className="hint">Nenhum endereço encontrado. Confira a grafia ou use a cidade da lista.</p>}
          {online.map((o) => (
            <button key={`${o.lat}|${o.lon}`} type="button" onClick={() => pick(o.label, o.lat, o.lon, "")} title={o.detail}>
              <span>{o.detail}</span>
            </button>
          ))}
          <p className="hint">{OSM_ATTRIBUTION}</p>
        </div>
      )}
      <p className="hint" aria-live="polite">
        {zone ? `Latitude ${br(zone.lat)}°, longitude ${br(zone.lon)}° · fuso ${zone.tz} · ${zone.text}.` : "Escolha um lugar."}
      </p>
      <p className="hint">Cidades do Brasil: IBGE. Cidades do mundo: GeoNames (CC-BY 4.0).</p>
    </div>
  );
}
