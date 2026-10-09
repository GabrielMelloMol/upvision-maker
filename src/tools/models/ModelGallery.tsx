import { Search, SearchX, Star } from "lucide-react";
import { useState } from "react";
import EmptyState from "../../ui/EmptyState";
import Segmented from "../../ui/Segmented";
import { CATEGORIES, CATEGORY_TAB, MODELS, type Category } from "./defs";
import { familiesIn, familyOf, modelOf, type Family } from "./families";
import { THUMBS } from "./thumbs";
import { searchModels } from "./search";
import { COLLECTIONS, inCollection, type Collection } from "./variants";

export { normalize } from "./search";

export type Occasion = Collection | "favorites" | null;
type Props = {
  id: string;
  onPick: (id: string) => void;
  category: Category;
  onCategory: (c: Category) => void;
  query: string;
  onQuery: (q: string) => void;
  occasion: Occasion;
  onOccasion: (o: Occasion) => void;
  favorites: string[];
};

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

/**
 * Galeria dos Modelos prontos (#141): por categoria, um card por família (a variação fica no painel); buscando ou
 * filtrando por ocasião/favoritos, a lista é por modelo, para achar direto pelo nome de antes.
 */
export default function ModelGallery({ id, onPick, category, onCategory, query, onQuery, occasion, onOccasion, favorites }: Props) {
  const q = query.trim();
  const [use, setUse] = useState(loadUse);
  const [allOccasions, setAllOccasions] = useState(false);
  // as 5 mais usadas (empate: a ordem de sempre) e a escolhida, se estiver entre as outras
  const ranked = [...COLLECTIONS].map((c, i) => ({ c, i })).sort((a, b) => (use[b.c[0]] ?? 0) - (use[a.c[0]] ?? 0) || a.i - b.i).map((x) => x.c);
  const top = ranked.slice(0, VISIBLE_OCCASIONS);
  const shownOccasions = allOccasions ? ranked : occasion && occasion !== "favorites" && !top.some(([c]) => c === occasion) ? [...top, ranked.find(([c]) => c === occasion)!] : top;
  const models = q
    ? searchModels(q).map((id) => MODELS.find((m) => m.id === id)!) // do que mais combina para o que menos
    : occasion === "favorites"
      ? MODELS.filter((m) => favorites.includes(m.id))
      : occasion
        ? MODELS.filter((m) => inCollection(m.id, occasion))
        : null;
  const families = models ? [] : familiesIn(category);
  const current = familyOf(id);

  function pickCategory(c: Category) {
    onCategory(c);
    onQuery("");
    onOccasion(null);
    if (current.category !== c) onPick(familiesIn(c)[0].variants[0].id);
  }
  function pickOccasion(o: Exclude<Occasion, null>) {
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
    onQuery("");
    const list = next === "favorites" ? MODELS.filter((m) => favorites.includes(m.id)) : next ? MODELS.filter((m) => inCollection(m.id, next)) : [];
    if (list.length && !list.some((m) => m.id === id)) onPick(list[0].id);
  }
  // card da família: a variação aberta, se for dela; senão a 1ª
  const pickFamily = (f: Family) => onPick(f.variants.some((v) => v.id === id) ? id : f.variants[0].id);
  const thumbOf = (f: Family) => {
    const v = f.variants.find((x) => x.id === id) ?? f.variants.find((x) => THUMBS[x.id]) ?? f.variants[0];
    return { src: THUMBS[v.id], Icon: modelOf(v.id).icon };
  };

  return (
    <div className="model-picker">
      <div className="row">
        {/* buscando ou filtrando, os resultados são de todas as categorias: nenhuma fica marcada */}
        <Segmented label="Categoria" value={(models ? "" : category) as Category} options={CATEGORIES.map(([c, label]) => [c, CATEGORY_TAB[c] ?? label] as const)} onChange={pickCategory} />
        <div className="affix has-prefix">
          <Search className="prefix" size={16} aria-hidden />
          <input type="search" placeholder="Buscar modelo" aria-label="Buscar modelo" value={query} onChange={(e) => onQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onQuery("")} />
        </div>
      </div>
      <div className="chips" role="group" aria-label="Ocasião">
        <button type="button" aria-pressed={occasion === "favorites"} onClick={() => pickOccasion("favorites")}>
          <Star aria-hidden size={14} /> Favoritos
        </button>
        {shownOccasions.map(([c, label]) => (
          <button key={c} type="button" aria-pressed={occasion === c} onClick={() => pickOccasion(c)}>
            {label}
          </button>
        ))}
        {COLLECTIONS.length > VISIBLE_OCCASIONS && (
          <button type="button" className="chips-more" aria-expanded={allOccasions} onClick={() => setAllOccasions((v) => !v)}>
            {allOccasions ? "Menos" : `Mais (${COLLECTIONS.length - VISIBLE_OCCASIONS})`}
          </button>
        )}
      </div>
      {models ? (
        <div className="model-gallery" role="group" aria-label="Modelo">
          {models.map((m) => (
            <button key={m.id} type="button" data-id={m.id} aria-pressed={m.id === id} onClick={() => {
                onPick(m.id);
                onCategory(familyOf(m.id).category); // limpando a busca, a aba já é a da família dele
              }} title={`${familyOf(m.id).label} · ${m.blurb}`} className={THUMBS[m.id] ? "has-thumb" : undefined}>
              {THUMBS[m.id] ? <img src={THUMBS[m.id]} alt="" loading="lazy" /> : <m.icon aria-hidden />}
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="model-families" role="group" aria-label="Família">
          {families.map((f) => {
            const { src, Icon } = thumbOf(f);
            return (
              <button key={f.id} type="button" data-family={f.id} data-variants={f.variants.map((v) => v.id).join(",")} aria-pressed={f.id === current.id} onClick={() => pickFamily(f)} title={f.variants.length > 1 ? f.variants.map((v) => v.label).join(" · ") : modelOf(f.variants[0].id).blurb}>
                <span className="model-thumb">{src ? <img src={src} alt="" loading="lazy" /> : <Icon aria-hidden />}</span>
                <span>{f.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {models && !models.length && q && <EmptyState icon={SearchX} title={`Nenhum modelo com “${query.trim()}”`} action={<button onClick={() => onQuery("")}>Limpar busca</button>} />}
      {models && !models.length && !q && occasion === "favorites" && (
        <EmptyState icon={Star} title="Nenhum favorito ainda">
          Abra um modelo e toque na estrela ao lado do nome para guardar aqui.
        </EmptyState>
      )}
    </div>
  );
}
