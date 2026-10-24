import { Star } from "lucide-react";
import { useState } from "react";
import { COLLECTIONS, type Collection } from "./variants";

export type Occasion = Collection | "favorites" | null;

const VISIBLE_OCCASIONS = 5;
const USE_KEY = "upvision.occasionUse";

/** Quantas vezes cada ocasião foi escolhida neste computador (para mostrar as mais usadas primeiro). */
function loadUse(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(USE_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Chips de Favoritos e de ocasião (Dia das Mães, Natal…): as 5 mais usadas aparecem, as outras ficam em "Mais". */
export default function OccasionChips({ occasion, onOccasion }: { occasion: Occasion; onOccasion: (o: Occasion) => void }) {
  const [use, setUse] = useState(loadUse);
  const [all, setAll] = useState(false);
  // as 5 mais usadas (empate: a ordem de sempre) e a escolhida, se estiver entre as outras
  const ranked = [...COLLECTIONS].map((c, i) => ({ c, i })).sort((a, b) => (use[b.c[0]] ?? 0) - (use[a.c[0]] ?? 0) || a.i - b.i).map((x) => x.c);
  const top = ranked.slice(0, VISIBLE_OCCASIONS);
  const shown = all ? ranked : occasion && occasion !== "favorites" && !top.some(([c]) => c === occasion) ? [...top, ranked.find(([c]) => c === occasion)!] : top;
  function pick(o: Exclude<Occasion, null>) {
    const next = occasion === o ? null : o;
    if (next && next !== "favorites") {
      const u = { ...use, [next]: (use[next] ?? 0) + 1 };
      setUse(u);
      try {
        localStorage.setItem(USE_KEY, JSON.stringify(u));
      } catch {
        // sem armazenamento local: a ordem vale só nesta sessão
      }
    }
    onOccasion(next);
  }
  return (
    <div className="chips" role="group" aria-label="Ocasião">
      <button type="button" aria-pressed={occasion === "favorites"} onClick={() => pick("favorites")}>
        <Star aria-hidden size={14} /> Favoritos
      </button>
      {shown.map(([c, label]) => (
        <button key={c} type="button" aria-pressed={occasion === c} onClick={() => pick(c)}>
          {label}
        </button>
      ))}
      {COLLECTIONS.length > VISIBLE_OCCASIONS && (
        <button type="button" className="chips-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Menos" : `Mais (${COLLECTIONS.length - VISIBLE_OCCASIONS})`}
        </button>
      )}
    </div>
  );
}
