import { bedMm } from "../geometry/bed";
import { Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getDb } from "../db";
import { loadCompany } from "../db/customersRepo";
import { isCursive, loadEmojiFont, loadFont, type FontId } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import { arcTextToCrossSection, hasEmoji, textToCrossSection } from "../geometry/text";
import { checkText, textWarnings } from "../geometry/textCheck";
import FontPicker from "../ui/FontPicker";
import Alert from "../ui/Alert";
import { exampleFile } from "../help/helpStore";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import Field from "../ui/Field";
import Preview3D from "../ui/Preview3D";
import Toggle from "../ui/Toggle";
import { errorText } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import { DESIGN_ACCEPT, designFromSvg, fileToSvg } from "./designInput";
import { MissingInput } from "../geometry/models/common";
import { MODELS, validParams, type Category, type Params } from "./models/defs";
import { inCollection, VARIANTS, type Collection } from "./models/variants";
import { profileFor } from "./models/printProfiles";
import { EMOJI_FIELDS } from "./models/emoji";
import { BATCH_FIELDS, layoutCopies, MAX_COPIES, parseBatch } from "./models/batch";
import type { Model } from "../geometry/types";
import { applyLayers } from "./models/applyLayers";
import DecalGizmo from "./models/DecalGizmo";
import LayersPanel, { layerValid } from "./models/LayersPanel";
import { useModelLayers, type ModelEdits } from "./models/useModelLayers";
import UserVariants from "./models/UserVariants";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";
import { takeIntent } from "./intent";
import ParamField, { firstText } from "./models/ParamField";
import ModelGallery, { type Occasion } from "./models/ModelGallery";
import VariantPicker from "./models/VariantPicker";
import { carryFields, familyOf, modelOf } from "./models/families";

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
  // ou pelo pedido (#164, "Preparar impressão"): com a personalização do item no lote
  const [intent] = useState(() => {
    const i = takeIntent<{ id?: string; batch?: string; occasion?: Collection }>("models");
    // vindo do destaque da ocasião (#120): abre no primeiro modelo da coleção
    return i?.occasion && !i.id ? { ...i, id: MODELS.find((m) => inCollection(m.id, i.occasion!))?.id } : i;
  });
  const [wanted] = useState(() => MODELS.find((m) => m.id === intent?.id));
  // a aba segue a família do modelo aberto (a família pode estar noutra categoria que o modelo, #141)
  const [category, setCategory] = useState<Category>(() => familyOf(wanted?.id ?? tool.state.id).category);
  // o modelo mudou por fora (continuar rascunho, reabrir projeto, desfazer): a aba vai para a família dele
  const [shownId, setShownId] = useState(id);
  if (shownId !== id) {
    setShownId(id);
    setCategory(familyOf(id).category);
  }
  useEffect(() => {
    if (!wanted) return;
    const batch = intent?.batch?.trim();
    adopt((cur) => (batch && BATCH_FIELDS[wanted.id] ? { ...cur, id: wanted.id, batchOn: true, batchText: { ...cur.batchText, [wanted.id]: batch } } : { ...cur, id: wanted.id }));
  }, [adopt, wanted, intent]);
  const [query, setQuery] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  // ocasião ou favoritos: filtro que atravessa as categorias (como a busca)
  const [occasion, setOccasion] = useState<Occasion>(intent?.occasion ?? null);
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const def = MODELS.find((m) => m.id === id)!;
  const lay = useModelLayers(id, tool.state.edits, (fn) => tool.set((cur) => ({ ...cur, edits: fn(cur.edits) }))); // camadas livres (#26)
  // trocar de variação na família (#141): texto, cores e fonte com o mesmo nome vão junto, num passo de desfazer
  const pickVariant = (next: string) =>
    tool.set((cur) => ({ ...cur, id: next, all: { ...cur.all, [next]: carryFields(modelOf(cur.id), cur.all[cur.id], modelOf(next), cur.all[next]) } }));
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
        if (!laid.fits) warn.add(`As cópias não cabem numa mesa de ${bedMm()} mm: divida o lote em mais arquivos.`);
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

  // escolhendo na galeria, os campos do modelo ficam na metade de baixo da tela: leva a tela até eles (UX B3)
  const layoutRef = useRef<HTMLDivElement>(null);
  const pickFromGallery = (next: string) => {
    setId(next);
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => layoutRef.current?.scrollIntoView?.({ behavior: calm ? "auto" : "smooth", block: "start" }));
  };
  const family = familyOf(id);

  return (
    <div className="page">
      <h1>Modelos prontos</h1>
      <p className="lead">Escolha, ajuste o texto e salve o 3MF em cores.</p>
      <ToolSessionBar tool={tool} />
      <ModelGallery id={id} onPick={pickFromGallery} category={category} onCategory={setCategory} query={query} onQuery={setQuery} occasion={occasion} onOccasion={setOccasion} favorites={favorites} />
      <div className="tool-layout" ref={layoutRef}>
        <div className="controls">
          <div className="row model-head">
            {/* o card da galeria é a família; o painel mostra de qual veio (Brinquedos › Quebra-cabeça), UX B2 */}
            <div className="model-title">
              {family.label !== def.label && <span className="model-family">{family.label}</span>}
              <h2>{def.label}</h2>
            </div>
            <button type="button" className="icon-button" aria-pressed={favorites.includes(id)} aria-label={favorites.includes(id) ? `Tirar ${def.label} dos favoritos` : `Favoritar ${def.label}`} onClick={toggleFavorite}>
              <Star aria-hidden fill={favorites.includes(id) ? "currentColor" : "none"} />
            </button>
          </div>
          <p className="hint">{def.blurb}</p>
          <VariantPicker id={id} onPick={pickVariant} />
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
              <h3>Lote</h3>
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
                  {!art && (
                    <button type="button" className="link" onClick={() => void exampleFile("heart").then(onArt)}>
                      Usar um desenho de exemplo
                    </button>
                  )}
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
