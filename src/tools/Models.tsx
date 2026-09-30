import { Search, SearchX, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb } from "../db";
import { loadCompany } from "../db/customersRepo";
import { isCursive, loadEmojiFont, loadFont, type FontId } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import { arcTextToCrossSection, hasEmoji, textToCrossSection } from "../geometry/text";
import { checkText, textWarnings } from "../geometry/textCheck";
import FontPicker from "../ui/FontPicker";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import EmptyState from "../ui/EmptyState";
import ExportButtons from "../ui/ExportButtons";
import Field from "../ui/Field";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import Toggle from "../ui/Toggle";
import { errorText } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import { DESIGN_ACCEPT, designFromSvg, fileToSvg } from "./designInput";
import { MissingInput } from "../geometry/models/common";
import { CATEGORIES, MODELS, validParams, type Category, type Params } from "./models/defs";
import { COLLECTIONS, inCollection, VARIANTS, type Collection } from "./models/variants";
import { profileFor } from "./models/printProfiles";
import { EMOJI_FIELDS } from "./models/emoji";
import { BATCH_FIELDS, layoutCopies, MAX_COPIES, parseBatch, PLATE_MM } from "./models/batch";
import type { Model } from "../geometry/types";
import { applyLayers } from "./models/applyLayers";
import DecalGizmo from "./models/DecalGizmo";
import LayersPanel, { layerValid } from "./models/LayersPanel";
import { useModelLayers, type ModelEdits } from "./models/useModelLayers";
import UserVariants from "./models/UserVariants";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";
import { takeIntent } from "./intent";
import { THUMBS } from "./models/thumbs";
import ParamField, { firstText } from "./models/ParamField";

/** Minúsculas e sem acento, para a busca. */
const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const ART_WIDTH_MM = 100; // o desenho é reescalado por cada modelo; aqui só normaliza
const FAVORITES_KEY = "upvision.favoriteModels";
/** Seção dos campos de posição (alinhamento, arrumação) que "Restaurar posição" volta ao padrão (#79). */
const ARRANGE_SECTION = "Arrumação";


function loadFavorites(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const initialState = () => ({
  id: MODELS[0].id,
  all: Object.fromEntries(MODELS.map((m) => [m.id, m.defaults])) as Record<string, Params>,
  font: "hanken" as FontId,
  art: null as { svg: string; name: string } | null,
  // lote (#76): uma linha por cópia, por modelo
  batchOn: false,
  batchText: {} as Record<string, string>,
  edits: {} as ModelEdits,
});
type ModelsState = ReturnType<typeof initialState>;

/** Modelos paramétricos prontos: escolha na galeria, ajuste os campos, veja em 3D e salve o 3MF em cores. */
export default function Models() {
  // estado de trabalho (#85): modelo, campos de cada modelo, fonte, desenho, lote, camadas e posições no mesmo desfazer
  const tool = useToolState("models", initialState, {
    label: "Modelos prontos",
    // modelos ou campos novos de uma versão mais nova do app ganham o padrão
    load: (raw) => {
      const r = raw as ModelsState;
      const base = initialState();
      return { ...base, ...r, id: MODELS.some((m) => m.id === r.id) ? r.id : base.id, all: Object.fromEntries(MODELS.map((m) => [m.id, { ...m.defaults, ...r.all?.[m.id] }])) };
    },
  });
  const { id, all, font, art, batchOn, batchText } = tool.state;
  const { adopt } = tool;
  const [setId, setAll, setFont, setArt, setBatchOn, setBatchText] = [tool.field("id"), tool.field("all"), tool.field("font"), tool.field("art"), tool.field("batchOn"), tool.field("batchText")];
  const [artError, setArtError] = useState<string | null>(null);
  // aberto pela galeria Criar (#139): já vem com o modelo escolhido, sem virar passo de desfazer
  const [wanted] = useState(() => MODELS.find((m) => m.id === takeIntent<{ id: string }>("models")?.id));
  const [category, setCategory] = useState<Category>(wanted?.category ?? MODELS[0].category);
  useEffect(() => {
    if (wanted) adopt((cur) => ({ ...cur, id: wanted.id }));
  }, [adopt, wanted]);
  const [query, setQuery] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  // ocasião ou favoritos: filtro que atravessa as categorias (como a busca)
  const [occasion, setOccasion] = useState<Collection | "favorites" | null>(null);
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const def = MODELS.find((m) => m.id === id)!;
  const lay = useModelLayers(id, tool.state.edits, (fn) => tool.set((cur) => ({ ...cur, edits: fn(cur.edits) }))); // camadas livres (#26)
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
  const set = (k: string) => (v: string | number | boolean) => tool.set((cur) => ({ ...cur, all: { ...cur.all, [id]: { ...cur.all[id], [k]: v } } }), `${id}.${k}`);

  // Placa Pix já vem com os dados da empresa (Preferências → Dados da empresa).
  useEffect(() => {
    getDb()
      .then(loadCompany)
      // preenchimento automático: não é passo de desfazer nem trabalho novo
      .then((c) => adopt((s) => ({ ...s, all: { ...s.all, pix: { ...s.all.pix, key: c.pixKey, name: c.pixName || c.tradeName || c.name, city: c.pixCity || c.city, subtitle: c.tradeName || c.name } } })))
      .catch((e) => console.warn("Sem dados da empresa para a placa Pix:", e));
  }, [adopt]);

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
    const offset = (id: string) => lay.offsets[id] ?? [0, 0]; // elementos internos arrastados no gizmo (#79)
    const run = (params: Params) => def.build({ M, art: design?.cs ?? null, artLayers: design?.layers, text, arc, fontText, offset }, params);
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
      // camadas livres (#26) vão por cima do modelo pronto, na peça principal
      const layered = await applyLayers(M, out.models, lay.layers.filter(layerValid));
      lay.setView({ face: layered.face, shapes: layered.shapes, byLayer: layered.byLayer, elements: out.elements ?? [] });
      return { models: layered.models, warnings: [...(textWarn ?? []), ...(out.warnings ?? []), ...layered.warnings], pauses: out.pauses };
    } finally {
      design?.cs.delete();
      design?.layers?.forEach((l) => l.cs.delete());
    }
  }, [def, p, font, useArt, valid, batchOn, batchValue, lay.layers, lay.offsets]);

  // posição dos elementos internos (#79): "Centralizar" põe no meio e zera os arrastes; "Restaurar" volta a arrumação padrão
  // zera os arrastes e ajusta os campos de arrumação num passo só do desfazer
  const arrange = (patch: Params) =>
    tool.set((cur) => ({ ...cur, all: { ...cur.all, [id]: { ...cur.all[id], ...patch } }, edits: { ...cur.edits, [id]: { layers: cur.edits[id]?.layers ?? [], offsets: {} } } }));
  function centerAll() {
    const middle = def.sections.flatMap((s) => s.fields).filter((f) => f.kind === "choice" && f.options.some(([v]) => v === "middle"));
    arrange(Object.fromEntries(middle.map((f) => [f.k, "middle"])));
  }
  function restorePosition() {
    const keys = def.sections.filter((s) => s.title === ARRANGE_SECTION).flatMap((s) => s.fields.map((f) => f.k));
    arrange(Object.fromEntries(keys.map((k) => [k, def.defaults[k]])));
  }
  const elements = copies ? [] : lay.view.elements;

  return (
    <div className="page">
      <h1>Modelos prontos</h1>
      <p className="lead">Escolha, ajuste o texto e salve o 3MF em cores.</p>
      <ToolSessionBar tool={tool} />
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
          <UserVariants
            modelId={id}
            params={p}
            layers={lay.layers}
            onApply={(params, layers) =>
              // campos e camadas da variação num passo só do desfazer
              tool.set((cur) => ({ ...cur, all: { ...cur.all, [id]: { ...def.defaults, ...params } }, edits: { ...cur.edits, [id]: { layers, offsets: cur.edits[id]?.offsets ?? {} } } }))
            }
          />
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
          <LayersPanel
            layers={lay.layers}
            selected={lay.selected}
            byLayer={lay.view.byLayer}
            onSelect={lay.select}
            onAddArt={lay.addArt}
            onAddText={() => lay.addText(font)}
            onChange={lay.change}
            onMove={lay.move}
            onDuplicate={lay.duplicate}
            onRemove={lay.remove}
            history={{ undo: tool.undo, redo: tool.redo, canUndo: tool.canUndo, canRedo: tool.canRedo }}
            disabled={copies ? "No lote, os desenhos e textos livres ficam de fora: desligue o lote para usá-los." : undefined}
          />
          <ExportButtons models={models} name={copies ? `${def.label}-lote` : `${def.label}-${String(p.text ?? p.line1 ?? p.title ?? p.base ?? "")}`} busy={busy} pauses={pauses} profile={profileFor(id, p)} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} busy={busy} busyText={`Gerando ${def.label.toLowerCase()}…`} error={error} emptyText={!valid ? "Corrija os campos em vermelho." : (missing ?? undefined)} />
          {lay.view.face && (lay.layers.length > 0 || elements.length > 0) && !copies && (
            <section className="card stack gizmo-card">
              <h3>Vista de cima · {lay.view.face.part}</h3>
              <DecalGizmo
                face={lay.view.face}
                layers={lay.layers}
                shapes={lay.view.shapes}
                selected={lay.selected}
                onSelect={lay.select}
                onCommit={lay.change}
                elements={elements}
                onMoveElement={lay.moveElement}
              />
              <p className="hint">
                Arraste para mover (gruda no centro e nas bordas; Alt solta; setas movem 1 mm).
                {lay.layers.length > 0 && " Nos seus desenhos e textos, a alça do canto muda o tamanho e a de cima gira (Shift: 15°)."}
              </p>
              {elements.length > 0 && (
                <div className="row">
                  <button type="button" className="sm" onClick={centerAll}>
                    Centralizar tudo
                  </button>
                  <button type="button" className="sm ghost" onClick={restorePosition}>
                    Restaurar posição
                  </button>
                </div>
              )}
            </section>
          )}
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
