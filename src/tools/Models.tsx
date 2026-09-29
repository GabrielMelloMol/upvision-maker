import { Search, SearchX, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getDb } from "../db";
import { loadCompany } from "../db/customersRepo";
import { isCursive, loadEmojiFont, loadFont, type FontId } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import { arcTextToCrossSection, hasEmoji, textToCrossSection } from "../geometry/text";
import { checkText, textWarnings } from "../geometry/textCheck";
import FontPicker from "../ui/FontPicker";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import EmojiPicker from "../ui/EmojiPicker";
import EmptyState from "../ui/EmptyState";
import ExportButtons from "../ui/ExportButtons";
import Field from "../ui/Field";
import MoneyField from "../ui/MoneyField";
import NumField from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import Toggle from "../ui/Toggle";
import { errorText } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import { DESIGN_ACCEPT, designFromSvg, fileToSvg } from "./designInput";
import { MissingInput } from "../geometry/models/common";
import { CATEGORIES, MODELS, validParams, type Category, type FieldDef, type Params, type Section } from "./models/defs";
import { COLLECTIONS, inCollection, VARIANTS, type Collection } from "./models/variants";
import { EMOJI_FIELDS } from "./models/emoji";
import { BATCH_FIELDS, layoutCopies, MAX_COPIES, parseBatch, PLATE_MM } from "./models/batch";
import type { Model } from "../geometry/types";
import "../styles/features.css";

/** Minúsculas e sem acento, para a busca. */
const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const ART_WIDTH_MM = 100; // o desenho é reescalado por cada modelo; aqui só normaliza
const FAVORITES_KEY = "upvision.favoriteModels";

/** Miniaturas geradas por `npm run thumbs` (src/assets/model-thumbs/<id>.jpg). */
const THUMBS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob("../assets/model-thumbs/*.jpg", { eager: true, query: "?url", import: "default" }) as Record<string, string>).map(([path, url]) => [path.replace(/^.*\/(.+)\.jpg$/, "$1"), url]),
);

function loadFavorites(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Modelos paramétricos prontos: escolha na galeria, ajuste os campos, veja em 3D e salve o 3MF em cores. */
export default function Models() {
  const [id, setId] = useState(MODELS[0].id);
  const [all, setAll] = useState<Record<string, Params>>(() => Object.fromEntries(MODELS.map((m) => [m.id, m.defaults])));
  const [font, setFont] = useState<FontId>("hanken");
  const [art, setArt] = useState<{ svg: string; name: string } | null>(null);
  const [artError, setArtError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>(MODELS[0].category);
  const [query, setQuery] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  // ocasião ou favoritos: filtro que atravessa as categorias (como a busca)
  const [occasion, setOccasion] = useState<Collection | "favorites" | null>(null);
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  // lote (#76): uma linha por cópia, por modelo
  const [batchOn, setBatchOn] = useState(false);
  const [batchText, setBatchText] = useState<Record<string, string>>({});
  const def = MODELS.find((m) => m.id === id)!;
  const q = normalize(query.trim());
  const shown = q
    ? MODELS.filter((m) => normalize(`${m.label} ${m.blurb}`).includes(q))
    : occasion === "favorites"
      ? MODELS.filter((m) => favorites.includes(m.id))
      : occasion
        ? MODELS.filter((m) => inCollection(m.id, occasion))
        : MODELS.filter((m) => m.category === category);
  function pickCategory(c: Category) {
    setCategory(c);
    setQuery("");
    setOccasion(null);
    if (def.category !== c) setId(MODELS.find((m) => m.category === c)!.id);
  }
  function pickOccasion(o: Collection | "favorites") {
    const next = occasion === o ? null : o;
    setOccasion(next);
    setQuery("");
    const list = next === "favorites" ? MODELS.filter((m) => favorites.includes(m.id)) : next ? MODELS.filter((m) => inCollection(m.id, next)) : [];
    if (list.length && !list.some((m) => m.id === id)) setId(list[0].id);
  }
  function toggleFavorite() {
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      // sem armazenamento local (modo privado): o favorito vale só nesta sessão
    }
  }
  // variações do modelo; com uma ocasião escolhida, as dela vêm primeiro
  const variants = [...(VARIANTS[id] ?? [])].sort((a, b) => Number(!!occasion && occasion !== "favorites" && !!b.collections?.includes(occasion)) - Number(!!occasion && occasion !== "favorites" && !!a.collections?.includes(occasion)));
  const applyVariant = (patch: Params) => setAll((a) => ({ ...a, [id]: { ...def.defaults, ...patch } }));
  const p = all[id];
  const set = (k: string) => (v: string | number | boolean) => setAll((a) => ({ ...a, [id]: { ...a[id], [k]: v } }));

  // Placa Pix já vem com os dados da empresa (Preferências → Dados da empresa).
  useEffect(() => {
    getDb()
      .then(loadCompany)
      .then((c) =>
        setAll((a) => ({ ...a, pix: { ...a.pix, key: c.pixKey, name: c.pixName || c.tradeName || c.name, city: c.pixCity || c.city, subtitle: c.tradeName || c.name } })),
      )
      .catch((e) => console.warn("Sem dados da empresa para a placa Pix:", e));
  }, []);

  async function onArt(f: File) {
    setArtError(null);
    try {
      setArt({ svg: await fileToSvg(f), name: f.name });
    } catch (e) {
      setArtError(errorText(e));
    }
  }

  const valid = validParams(def, p);
  const batchKeys = BATCH_FIELDS[id];
  const batchLabels = batchKeys?.map((k) => def.sections.flatMap((s) => s.fields).find((f) => f.k === k)?.label ?? k);
  const batchValue = batchText[id] ?? (batchKeys ? batchKeys.map((k) => String(p[k] ?? "")).join("; ") : "");
  const copies = batchOn && batchKeys ? parseBatch(batchValue, batchKeys) : null;
  const useArt = def.art ? art : null;
  const { models, warnings, pauses, busy, error } = useModelBuilder(async () => {
    if (!valid) return null;
    const M = await getManifold();
    const f = await loadFont(font);
    const fields = def.sections.flatMap((s) => s.fields);
    // emoji: a fonte reserva só é carregada se algum texto tiver emoji
    const texts = [...fields.filter((x) => x.kind === "text").map((x) => String(p[x.k] ?? "")), batchOn ? batchValue : ""];
    const emoji = texts.some(hasEmoji) ? await loadEmojiFont() : undefined;
    // fontes próprias de partes do modelo (campos "font")
    const extra = Object.fromEntries(await Promise.all(fields.filter((x) => x.kind === "font").map(async (x) => [x.k, await loadFont(String(p[x.k]))] as const)));
    const design = useArt ? await designFromSvg(useArt.svg, ART_WIDTH_MM, false, true) : null;
    // traço fino / letras soltas: checa o primeiro texto do modelo (o principal)
    let textWarn: string[] | null = null;
    const text = (s: string, h: number) => {
      if (!s.trim()) return null;
      const cs = textToCrossSection(M, f, s, h, emoji);
      textWarn ??= textWarnings(checkText(cs), s, isCursive(font));
      return cs;
    };
    const arc = (s: string, h: number, r: number, side: "top" | "bottom") => (s.trim() ? arcTextToCrossSection(M, f, s, h, r, side, emoji) : null);
    const fontText = (k: string) => (s: string, h: number) => {
      if (!s.trim()) return null;
      const cs = textToCrossSection(M, extra[k] ?? f, s, h, emoji);
      textWarn ??= textWarnings(checkText(cs), s, isCursive(String(p[k])));
      return cs;
    };
    const run = (params: Params) => def.build({ M, art: design?.cs ?? null, artLayers: design?.layers, text, arc, fontText }, params);
    try {
      if (copies) {
        // lote: uma geração por cópia, cada cópia arrumada como um bloco na mesa
        if (!copies.length) {
          setMissing("Digite uma linha por cópia.");
          return null;
        }
        const done: { label: string; models: Model[] }[] = [];
        const warn = new Set<string>();
        const pauses = new Set<number>();
        for (const [i, patch] of copies.slice(0, MAX_COPIES).entries()) {
          try {
            const out = run({ ...p, ...patch });
            done.push({ label: Object.values(patch).find((v) => String(v).trim()) as string ?? `Cópia ${i + 1}`, models: out.models });
            out.warnings?.forEach((w) => warn.add(w));
            out.pauses?.forEach((z) => pauses.add(z));
          } catch (e) {
            if (!(e instanceof MissingInput)) throw e;
            warn.add(`Cópia ${i + 1} ficou de fora: ${e.message}`);
          }
        }
        if (!done.length) {
          setMissing("Nenhuma cópia gerou modelo: confira as linhas do lote.");
          return null;
        }
        const laid = layoutCopies(done);
        if (!laid.fits) warn.add(`As cópias não cabem numa mesa de ${PLATE_MM} mm: divida o lote em mais arquivos.`);
        if (copies.length > MAX_COPIES) warn.add(`Só as primeiras ${MAX_COPIES} cópias foram geradas.`);
        setMissing(null);
        return { models: laid.models, warnings: [...(textWarn ?? []), ...warn], pauses: [...pauses].sort((a, b) => a - b) };
      }
      let out;
      try {
        out = run(p);
      } catch (e) {
        // dado obrigatório faltando não é erro: vira o texto da prévia vazia
        if (!(e instanceof MissingInput)) throw e;
        setMissing(e.message);
        return null;
      }
      setMissing(null);
      return { models: out.models, warnings: [...(textWarn ?? []), ...(out.warnings ?? [])], pauses: out.pauses };
    } finally {
      design?.cs.delete();
      design?.layers?.forEach((l) => l.cs.delete());
    }
  }, [def, p, font, useArt, valid, batchOn, batchValue]);

  return (
    <div className="page">
      <h1>Modelos prontos</h1>
      <p className="lead">Escolha um modelo, ajuste texto, tamanho e cores e salve o 3MF já separado por cor.</p>
      <div className="model-picker">
        <div className="row">
          {/* buscando, os resultados são de todas as categorias: nenhuma fica marcada */}
          <Segmented label="Categoria" value={(q || occasion ? "" : category) as Category} options={CATEGORIES} onChange={pickCategory} />
          <div className="affix has-prefix">
            <Search className="prefix" size={16} aria-hidden />
            <input
              type="search"
              placeholder="Buscar modelo"
              aria-label="Buscar modelo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            />
          </div>
        </div>
        <div className="chips" role="group" aria-label="Ocasião">
          <button type="button" aria-pressed={occasion === "favorites"} onClick={() => pickOccasion("favorites")}>
            <Star aria-hidden size={14} /> Favoritos
          </button>
          {COLLECTIONS.map(([c, label]) => (
            <button key={c} type="button" aria-pressed={occasion === c} onClick={() => pickOccasion(c)}>
              {label}
            </button>
          ))}
        </div>
        <div className="model-gallery" role="group" aria-label="Modelo">
        {shown.map((m) => (
          <button key={m.id} type="button" data-id={m.id} aria-pressed={m.id === id} onClick={() => setId(m.id)} title={m.blurb} className={THUMBS[m.id] ? "has-thumb" : undefined}>
            {THUMBS[m.id] ? <img src={THUMBS[m.id]} alt="" loading="lazy" /> : <m.icon aria-hidden />}
            <span>{m.label}</span>
          </button>
        ))}

        </div>
        {!shown.length && q && (
          <EmptyState icon={SearchX} title={`Nenhum modelo com “${query.trim()}”`} action={<button onClick={() => setQuery("")}>Limpar busca</button>} />
        )}
        {!shown.length && !q && occasion === "favorites" && (
          <EmptyState icon={Star} title="Nenhum favorito ainda">
            Abra um modelo e toque na estrela ao lado do nome para guardar aqui.
          </EmptyState>
        )}
      </div>
      <div className="tool-layout">
        <div className="controls">
          <div className="row model-head">
            <h2>{def.label}</h2>
            <button type="button" className="icon-button" aria-pressed={favorites.includes(id)} aria-label={favorites.includes(id) ? `Tirar ${def.label} dos favoritos` : `Favoritar ${def.label}`} onClick={toggleFavorite}>
              <Star aria-hidden fill={favorites.includes(id) ? "currentColor" : "none"} />
            </button>
          </div>
          <p className="hint">{def.blurb}</p>
          {variants.length > 0 && (
            <div className="chips" role="group" aria-label="Variações prontas">
              {variants.map((v) => (
                <button key={v.label} type="button" onClick={() => applyVariant(v.patch)}>
                  {v.label}
                </button>
              ))}
            </div>
          )}
          {batchKeys && (
            <div className="card stack">
              <Toggle label="Lote: várias cópias na mesma mesa" checked={batchOn} onChange={setBatchOn} />
              {batchOn && (
                <Field label="Cópias (uma por linha)" hint={`${batchLabels!.join("; ")} · ${copies?.length ?? 0} cópias`}>
                  <textarea rows={5} value={batchValue} onChange={(e) => setBatchText((b) => ({ ...b, [id]: e.target.value }))} />
                </Field>
              )}
            </div>
          )}
          {def.sections.map((s) => (
            <div className="card stack" key={s.title}>
              <h3>{s.title}</h3>
              <div className="grid two">
                {s.fields.map((f) => (
                  <ParamField key={f.k} f={f} value={p[f.k]} onChange={set(f.k)} sample={f.kind === "font" && f.sample ? String(p[f.sample] ?? "") : ""} emoji={!!EMOJI_FIELDS[id]?.includes(f.k)} />
                ))}
              </div>
              {s === def.sections[def.fontSection ?? 0] && def.font && (
                <FontPicker value={font} onChange={setFont} sample={firstText(def.sections, p)} />
              )}
              {s === def.sections[0] && def.art && (
                <>
                  <Dropzone accept={DESIGN_ACCEPT} label={art ? art.name : def.art} hint="SVG ou imagem (vira vetor sozinha)." onFile={onArt} />
                  {artError && <Alert kind="error">{artError}</Alert>}
                  {art && (
                    <button className="link danger" onClick={() => setArt(null)}>
                      Remover desenho
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <ExportButtons models={models} name={copies ? `${def.label}-lote` : `${def.label}-${String(p.text ?? p.line1 ?? p.title ?? p.base ?? "")}`} busy={busy} pauses={pauses} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy} busyText={`Gerando ${def.label.toLowerCase()}…`} error={error} emptyText={!valid ? "Corrija os campos em vermelho." : (missing ?? undefined)} />
          {warnings.map((w) => (
            <Alert key={w} kind="info">
              {w}
            </Alert>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Primeiro texto preenchido do modelo: é a prévia no seletor de fonte. */
const firstText = (sections: Section[], p: Params) =>
  sections.flatMap((s) => s.fields).map((f) => (f.kind === "text" ? String(p[f.k] ?? "").trim() : "")).find(Boolean) ?? "";

type ParamProps = { f: FieldDef; value: Params[string]; onChange: (v: string | number | boolean) => void; sample?: string; emoji?: boolean };

/** Texto com seletor de emoji ao lado (fora do <label>, para o rótulo nomear só o campo). */
function EmojiText({ label, hint, max, value, onChange }: { label: string; hint?: string; max?: number; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="field-with-emoji">
      <Field label={label} hint={hint}>
        <input ref={ref} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
      </Field>
      <EmojiPicker inputRef={ref} value={value} onChange={onChange} />
    </div>
  );
}

function ParamField({ f, value, onChange, sample = "", emoji }: ParamProps) {
  switch (f.kind) {
    case "font":
      return (
        <div className="span-2">
          <FontPicker label={f.label} value={String(value)} onChange={onChange} sample={sample} />
        </div>
      );
    case "num":
      return <NumField label={f.label} value={value as number} onChange={onChange} min={f.min} max={f.max} step={f.step} unit={f.unit} hint={f.hint} />;
    case "text":
      if (emoji) return <EmojiText label={f.label} hint={f.hint} max={f.max} value={String(value)} onChange={onChange} />;
      return (
        <Field label={f.label} hint={f.hint}>
          <input value={String(value)} maxLength={f.max} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "money":
      return <MoneyField label={f.label} value={String(value)} onChange={onChange} hint={f.hint} />;
    case "color":
      return (
        <label>
          {f.label}
          <input type="color" value={String(value)} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
    case "bool":
      return <Toggle label={f.label} checked={Boolean(value)} onChange={onChange} />;
    case "choice":
      return (
        <div className="span-2">
          <span className="field-label">{f.label}</span>
          <Segmented label={f.label} value={String(value)} options={f.options} onChange={onChange} full />
        </div>
      );
  }
}
