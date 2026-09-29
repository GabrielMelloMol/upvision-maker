import { ChevronDown, Search, Star, Trash2, Type, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ensureCssFont, FONT_ACCEPT, FONT_CATEGORIES, FONTS, importFont, removeUserFont, subscribeUserFonts, type FontEntry, type FontId } from "../geometry/fonts";
import Alert from "./Alert";
import Sheet from "./Sheet";
import { errorText } from "./Toast";

const FAV_KEY = "upvision.fontFavorites";
const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function readFavs(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeFavs(v: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(v));
  } catch {
    // sem armazenamento (janela privada): favoritas valem só nesta sessão
  }
}

/** Fontes importadas (IndexedDB), atualizadas quando alguém importa ou remove. */
export function useUserFonts(): FontEntry[] {
  const [list, setList] = useState<FontEntry[]>([]);
  useEffect(() => subscribeUserFonts(setList), []);
  return list;
}

/** Registra a fonte no CSS e devolve se já dá para desenhar com ela. */
function useCssFont(id: FontId): boolean {
  const [readyId, setReadyId] = useState<FontId | null>(null);
  useEffect(() => {
    let alive = true;
    ensureCssFont(id)
      .then(() => alive && setReadyId(id))
      .catch((e) => console.warn("Prévia da fonte indisponível:", e));
    return () => {
      alive = false;
    };
  }, [id]);
  return readyId === id;
}

type Filter = "Todas" | "Favoritas" | (typeof FONT_CATEGORIES)[number] | "Minhas";

type Props = { value: FontId; onChange: (id: FontId) => void; /** Texto da prévia (o nome digitado). */ sample: string; label?: string };

/** Seletor visual de fonte: botão com a prévia e, ao abrir, a lista com busca, categorias, favoritas e importar. */
export default function FontPicker({ value, onChange, sample, label = "Fonte" }: Props) {
  const [open, setOpen] = useState(false);
  const user = useUserFonts();
  const current = [...FONTS, ...user].find((f) => f.id === value);
  const text = sample.trim() || "Exemplo";
  const ready = useCssFont(value);

  return (
    <div className="font-field">
      <span className="font-field-label">{label}</span>
      <button type="button" className="font-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${label}: ${current?.label ?? value}. Trocar fonte`}>
        <span className="font-trigger-sample" style={{ fontFamily: ready ? current?.css : undefined }}>
          {text}
        </span>
        <span className="font-trigger-name">{current?.label ?? "Fonte removida"}</span>
        <ChevronDown aria-hidden size={16} />
      </button>
      {open && (
        <FontSheet
          value={value}
          sample={text}
          user={user}
          onClose={() => setOpen(false)}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function FontSheet({ value, sample, user, onPick, onClose }: { value: FontId; sample: string; user: FontEntry[]; onPick: (id: FontId) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Todas");
  const [favs, setFavs] = useState(readFavs);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const all = [...FONTS, ...user];
  const q = normalize(query.trim());
  const shown = all.filter((f) => {
    if (q) return normalize(`${f.label} ${f.category}`).includes(q);
    if (filter === "Todas") return true;
    if (filter === "Favoritas") return favs.includes(f.id);
    return f.category === filter;
  });
  const filters: Filter[] = ["Todas", "Favoritas", ...FONT_CATEGORIES, ...(user.length ? (["Minhas"] as const) : [])];

  function toggleFav(id: FontId) {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    writeFavs(next);
  }

  async function onImport(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const f = await importFont(file);
      setFilter("Minhas");
      setQuery("");
      onPick(f.id);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function onRemove(id: FontId) {
    setError(null);
    try {
      await removeUserFont(id);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Sheet title="Escolher fonte" icon={Type} onClose={onClose} wide>
      <div className="font-sheet">
        <div className="row">
          <div className="affix has-prefix">
            <Search className="prefix" size={16} aria-hidden />
            <input type="search" data-autofocus placeholder="Buscar fonte" aria-label="Buscar fonte" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden size={16} /> Importar .ttf/.otf
          </button>
          <input ref={fileRef} type="file" accept={FONT_ACCEPT} hidden aria-label="Arquivo de fonte" onChange={(e) => void onImport(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="font-filters" role="group" aria-label="Categoria">
          {filters.map((c) => (
            <button key={c} type="button" aria-pressed={!q && filter === c} onClick={() => {
              setFilter(c);
              setQuery("");
            }}>
              {c}
            </button>
          ))}
        </div>
        {shown.length ? (
          <ul className="font-grid" aria-label="Fontes">
            {shown.map((f) => (
              <FontCard key={f.id} f={f} sample={sample} selected={f.id === value} fav={favs.includes(f.id)} onPick={onPick} onFav={toggleFav} onRemove={f.category === "Minhas" ? onRemove : undefined} />
            ))}
          </ul>
        ) : (
          <p className="hint">{q ? `Nenhuma fonte com “${query.trim()}”.` : filter === "Favoritas" ? "Toque na estrela de uma fonte para guardá-la aqui." : "Nenhuma fonte aqui."}</p>
        )}
        <p className="hint">Fontes do Google Fonts (licença SIL OFL), funcionam sem internet. Fontes importadas ficam salvas neste computador.</p>
      </div>
    </Sheet>
  );
}

type CardProps = { f: FontEntry; sample: string; selected: boolean; fav: boolean; onPick: (id: FontId) => void; onFav: (id: FontId) => void; onRemove?: (id: FontId) => void };

function FontCard({ f, sample, selected, fav, onPick, onFav, onRemove }: CardProps) {
  const ready = useCssFont(f.id);
  return (
    <li className="font-card" data-selected={selected || undefined}>
      <button type="button" className="font-card-pick" aria-pressed={selected} aria-label={`${f.label} (${f.category})`} onClick={() => onPick(f.id)}>
        <span className="font-card-sample" style={{ fontFamily: ready ? f.css : undefined, opacity: ready ? 1 : 0.35 }}>
          {sample}
        </span>
        <span className="font-card-name">
          {f.label} <span className="muted">· {f.category}</span>
        </span>
      </button>
      <div className="font-card-actions">
        <button type="button" className="ghost icon-only" aria-pressed={fav} aria-label={fav ? `Tirar ${f.label} das favoritas` : `Favoritar ${f.label}`} onClick={() => onFav(f.id)}>
          <Star aria-hidden size={16} fill={fav ? "currentColor" : "none"} />
        </button>
        {onRemove && (
          <button type="button" className="ghost icon-only danger" aria-label={`Remover ${f.label}`} onClick={() => onRemove(f.id)}>
            <Trash2 aria-hidden size={16} />
          </button>
        )}
      </div>
    </li>
  );
}
