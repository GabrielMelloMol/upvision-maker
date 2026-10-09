import { useEffect, useMemo, useRef, useState } from "react";
import type { Filament } from "../domain/entities";
import { lumaGrid } from "../geometry/heightfield";
import { fitAspect, loopSeam } from "../geometry/lithophaneShapes";
import { applyShapeMask } from "../geometry/lithophaneShaped";
import { buildColorLithophane, colorPreview, DEFAULT_COLOR_LITHO, type ColorLithoParams } from "../geometry/lithophaneColor";
import ColorLithoPanel from "./ColorLithoPanel";
import ReliefPanel, { DEFAULT_RELIEF_UI, type ReliefUi } from "./ReliefPanel";
import { buildRelief } from "../geometry/relief";
import { buildLithophaneSet, lithoGrid, seamOf } from "../geometry/lithophaneSet";
import { bedWarnings } from "./models/bedCheck";
import Toggle from "../ui/Toggle";
import { buildLayeredPicture, DEFAULT_LAYERED, type ColorSwap } from "../geometry/layeredPicture";
import { backlitPreview, DEFAULT_LITHO, type LedOptions, type LithoShape } from "../geometry/lithophane";
import type { Model } from "../geometry/types";
import { getManifold } from "../geometry/manifold";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import { COLOR_LITHO_PROFILE, LAYERED_PROFILE, LITHO_PROFILE, RELIEF_PROFILE } from "../geometry/printProfile";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import { useData } from "../ui/useData";
import { useModelBuilder } from "../ui/useModelBuilder";
import { IMAGE_ACCEPT, loadRaster } from "../vectorize/client";
import { exampleFile, useExample } from "../help/helpStore";
import { restoreFile, storeFile, type StoredFile } from "./storedFile";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";
import { filamentColors, loadFilaments } from "./filamentColors";
import { toDataUrl } from "./rasterUrl";
import LayeredPanel, { DEFAULT_LAYERED_UI, type LayeredUi, type Thumb } from "./layered/LayeredPanel";
import { segmentSubject } from "../vectorize/segment";

type Mode = "litho" | "color" | "relief" | "layered";
const MODES: [Mode, string][] = [
  ["litho", "Litofania"],
  ["color", "Colorida"],
  ["relief", "Relevo"],
  ["layered", "Quadro por camadas"],
];
const SHAPES: [LithoShape, string][] = [
  ["flat", "Plana"],
  ["curved", "Curva"],
  ["box", "Caixa de luz"],
  ["cylinder", "Cilindro (abajur)"],
  ["heart", "Coração"],
  ["circle", "Círculo"],
];
const DEFAULT_LED: LedOptions = { kind: "disc", size: 50, power: "cable" };
const LED_KINDS: ["disc" | "strip", string][] = [
  ["disc", "Disco"],
  ["strip", "Fita"],
];
const LED_POWER: ["cable" | "battery", string][] = [
  ["cable", "Cabo"],
  ["battery", "Pilhas"],
];
const SHAPE_HINT: Partial<Record<LithoShape, string>> = {
  cylinder: "A foto dá a volta inteira (360°), com a emenda disfarçada; o relevo fica por dentro. Informe o diâmetro e a altura.",
  heart: "A foto é cortada no formato de coração, com a moldura acompanhando o contorno.",
  circle: "A foto é cortada em círculo, com a moldura acompanhando o contorno.",
  box: "A caixa leva a mesma foto nos 4 lados.",
};
type View = "light" | "3d";
const VIEWS: [View, string][] = [
  ["light", "Contra a luz"],
  ["3d", "3D"],
];
const COLOR_MIN_CELL = 0.4; // 5 camadas de relevo: mais fino que isso deixa a peça pesada demais
const THUMB_W = 72; // miniaturas das paletas prontas
const FALLBACK_COLORS = DEFAULT_LAYERED.colors;
const mmText = (n: number) => n.toFixed(2).replace(".", ",");

const initialState = () => ({ mode: "litho" as Mode, file: null as File | null, width: 100, cell: 0.3, litho: DEFAULT_LITHO, color: DEFAULT_COLOR_LITHO as ColorLithoParams, relief: DEFAULT_RELIEF_UI, layered: DEFAULT_LAYERED_UI as LayeredUi });
type LithoState = ReturnType<typeof initialState>;

/** Foto → litofania (relevo que aparece contra a luz) ou quadro por camadas de filamento (estilo HueForge). */
export default function Lithophane() {
  // estado de trabalho: desfazer, rascunho guardado (a foto vai junto até 4 MB) e últimos projetos (#85)
  const tool = useToolState("lithophane", initialState, {
    label: "Litofania",
    save: async (s) => ({ ...s, file: await storeFile(s.file) }),
    load: async (raw) => {
      const r = raw as Omit<LithoState, "file"> & { file?: StoredFile | null };
      return { ...r, file: await restoreFile(r.file) };
    },
  });
  const { mode, file, width, cell, layered } = tool.state;
  const color = useMemo(() => ({ ...DEFAULT_COLOR_LITHO, ...tool.state.color, inks: { ...DEFAULT_COLOR_LITHO.inks, ...tool.state.color?.inks } }), [tool.state.color]);
  const litho = useMemo(() => ({ ...DEFAULT_LITHO, ...tool.state.litho }), [tool.state.litho]); // rascunho de antes dos formatos novos não tem os campos novos; memo: objeto novo a cada render refaria a peça sem parar
  const led = litho.led;
  const [setMode, setFile, setWidth, setCell, setLitho, setLayered] = [tool.field("mode"), tool.field("file"), tool.field("width"), tool.field("cell"), tool.field("litho"), tool.field("layered")];
  const setColor = tool.field("color");
  const relief = useMemo((): ReliefUi => ({ ...DEFAULT_RELIEF_UI, ...tool.state.relief }), [tool.state.relief]);
  const setRelief = tool.field("relief");;
  useExample("lithophane", () => void exampleFile("landscape").then(setFile)); // "Usar exemplo" da ajuda (#84)
  const [swaps, setSwaps] = useState<ColorSwap[]>([]);
  const [view, setView] = useState<View>("light");
  const [backlit, setBacklit] = useState<string | null>(null);
  const [exportModels, setExportModels] = useState<Model[]>([]);
  const original = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (original && URL.revokeObjectURL(original)), [original]);
  const [rows] = useData(loadFilaments, [] as Filament[]);
  const filColors = useMemo(() => filamentColors(rows), [rows]);
  const nameOf = (hex: string) => filColors.find((f) => f.hex === hex)?.label ?? hex;
  const colors = layered.colors.length >= 2 ? layered.colors : FALLBACK_COLORS;
  const setL = <K extends keyof typeof litho>(k: K) => (v: (typeof litho)[K]) => setLitho((o) => ({ ...o, [k]: v }));
  const [thumb, setThumb] = useState<Thumb | null>(null);
  const [magnetZ, setMagnetZ] = useState<number | undefined>();
  const masks = useRef(new Map<string, Uint8Array | null>()); // a Silhueta é lenta: guarda por foto, tamanho e tipo

  const valid =
    inRange(width, 20, 250) &&
    inRange(cell, 0.15, 1) &&
    (mode === "relief"
      ? inRange(relief.depth, 0.5, 10) && inRange(relief.base, 0.6, 5) && inRange(relief.smooth, 0, 3) && inRange(relief.gamma, 0.4, 2.5) && inRange(relief.border, 0, 15)
      : mode === "color"
      ? inRange(color.maxInk, 0.4, 4) && inRange(color.whiteT, 0.4, 3) && inRange(color.border, 3, 15)
      : mode === "litho"
      ? inRange(litho.minT, 0.4, 3) && inRange(litho.maxT, 1, 8) && inRange(litho.border, 0, 15) && inRange(litho.arc, 30, 270) &&
        (litho.shape !== "cylinder" || (inRange(litho.diameter, 30, 150) && inRange(litho.height, 30, 200))) &&
        (!led || (led.kind === "disc" ? inRange(led.size, 15, 120) : inRange(led.size, 4, 20)))
      : inRange(layered.base, 0.2, 3) && inRange(layered.relief, 0.4, 6) && inRange(layered.layerHeight, 0.04, 0.32) && (!layered.magnet || (inRange(layered.magnetD ?? 10, 4, 30) && inRange(layered.magnetH ?? 2, 1, 5))));

  const { models, warnings, pauses, busy, error } = useModelBuilder(async () => {
    if (!file || !valid) return null;
    const grid = mode === "litho" ? lithoGrid(litho, width, cell) : { ...lithoGrid({ ...litho, shape: "flat" }, width, mode === "color" ? Math.max(cell, COLOR_MIN_CELL) : cell), aspect: null };
    const { step, cols } = grid;
    const r = await loadRaster(file, (w) => cols / w);
    URL.revokeObjectURL(r.url);
    const full = lumaGrid(r.rgba, r.w, r.h);
    const crop = grid.aspect ? fitAspect(full, r.w, r.h, grid.aspect) : { luma: full, w: r.w, h: r.h };
    const luma = crop.luma;
    if (mode === "relief") {
      setSwaps([]);
      const subject = relief.subject;
      const key = `${file.name}:${file.size}:${r.w}:${subject}`;
      if (subject !== "none" && !masks.current.has(key)) masks.current.set(key, await segmentSubject(r.rgba, r.w, r.h, subject));
      const mask = subject !== "none" ? (masks.current.get(key) ?? null) : null;
      const model = buildRelief(luma, r.w, r.h, step, relief, mask);
      setExportModels([model]);
      const warn = step > cell ? [`Detalhe limitado a ${mmText(step)} mm por ponto para a peça não ficar pesada.`] : [];
      return { models: [model], warnings: [...warn, ...bedWarnings([model], [])] };
    }
    if (mode === "color") {
      setSwaps([]);
      const M = await getManifold();
      const out = buildColorLithophane(M, r.rgba, r.w, r.h, step, color);
      setBacklit(toDataUrl(colorPreview(out.thickness, r.w, r.h, color), r.w, r.h));
      setExportModels([out.model]);
      const warn = step > cell ? [`Detalhe limitado a ${mmText(step)} mm por ponto para a peça não ficar pesada.`] : [];
      return { models: [out.model], warnings: [...warn, ...out.warnings, ...bedWarnings([out.model], [])] };
    }
    r.w = crop.w;
    r.h = crop.h;
    const M = await getManifold();
    const warn = step > cell ? [`Detalhe limitado a ${mmText(step)} mm por ponto para a peça não ficar pesada.`] : [];
    if (mode === "litho") {
      setSwaps([]);
      const wrap = litho.shape === "cylinder";
      // a prévia mostra o que a luz vê: no cilindro, a foto aberta já com a emenda; no coração e círculo, só a forma
      const flat = wrap ? loopSeam(luma, r.w, r.h, seamOf(r.w)) : { luma, cols: r.w };
      let backlitRgba: Uint8ClampedArray<ArrayBuffer> = backlitPreview(flat.luma, flat.cols, r.h, step, litho, wrap);
      if (litho.shape === "heart" || litho.shape === "circle") backlitRgba = applyShapeMask(backlitRgba, flat.cols, r.h, step, litho.shape, litho.border);
      setBacklit(toDataUrl(backlitRgba, flat.cols, r.h));
      const set = buildLithophaneSet(M, luma, r.w, r.h, step, litho);
      setExportModels(set.models);
      return { models: set.models, warnings: [...warn, ...set.warnings, ...bedWarnings(set.models, [])] };
    }
    setThumb(thumbOf(luma, r.w, r.h));
    const subject = layered.subject ?? "none";
    const key = `${file.name}:${file.size}:${r.w}:${subject}`;
    if (subject !== "none" && !masks.current.has(key)) masks.current.set(key, await segmentSubject(r.rgba, r.w, r.h, subject));
    const mask = subject !== "none" ? (masks.current.get(key) ?? null) : null;
    const tds = colors.map((hex) => filColors.find((f) => f.hex === hex)?.td ?? null);
    const out = buildLayeredPicture(M, luma, r.w, r.h, step, { ...layered, colors, tds, mask, background: mask ? layered.background : null });
    // faixas com o nome do filamento na legenda; a prévia é sempre colorida, o arquivo segue o toggle
    const named = (m: Model): Model => (m.parts.length > 1 ? { ...m, parts: m.parts.map((p) => ({ ...p, name: nameOf(p.color) })) } : m);
    setSwaps(out.swaps);
    setMagnetZ(out.magnetZ);
    setExportModels([named(out.model)]);
    const colorPauses = layered.split ? [] : out.swaps.map((s) => s.z);
    const pauses = [...(out.magnetZ ? [out.magnetZ] : []), ...colorPauses].sort((a, b) => a - b);
    return { models: [named(out.preview)], warnings: [...warn, ...out.warnings], pauses };
  }, [file, width, cell, mode, litho, color, relief, layered, colors.join(), filColors, valid]);

  return (
    <div className="page">
      <h1>Litofania e quadro</h1>
      <p className="lead">Foto em relevo: litofania ou quadro por camadas.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Foto</h3>
            <Segmented label="Tipo" value={mode} options={MODES} onChange={setMode} full />
            <Dropzone accept={IMAGE_ACCEPT} label={file ? file.name : "Arraste uma foto ou clique"} hint="Rostos e paisagens com bom contraste ficam melhores." onFile={setFile} />
            {!(mode === "litho" && litho.shape === "cylinder") && <NumField label="Largura" value={width} onChange={setWidth} min={20} max={250} step={1} />}
          </div>
          {mode === "litho" ? (
            <>
            <div className="card stack">
              <h3>Litofania</h3>
              <label>
                Formato
                <select value={litho.shape} onChange={(e) => setL("shape")(e.target.value as LithoShape)}>
                  {SHAPES.map(([id, text]) => (
                    <option key={id} value={id}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
              {litho.shape === "cylinder" && (
                <div className="grid two">
                  <NumField label="Diâmetro" value={litho.diameter} onChange={setL("diameter")} min={30} max={150} step={1} />
                  <NumField label="Altura" value={litho.height} onChange={setL("height")} min={30} max={200} step={1} />
                </div>
              )}
              <span className="hint">
                Sai em pé, como se imprime litofania. Use filamento branco, 100% de preenchimento e camada de 0,12 mm.
                {SHAPE_HINT[litho.shape] && ` ${SHAPE_HINT[litho.shape]}`}
              </span>
              {litho.shape === "cylinder" && <Toggle label="Tampa de cima" checked={litho.lid} onChange={setL("lid")} hint="Um disco com colar que entra no cilindro, para fechar o abajur por cima." />}
            </div>
            {(litho.shape === "flat" || litho.shape === "cylinder" || litho.shape === "heart" || litho.shape === "circle") && (
              <div className="card stack">
                <h3>Base de LED</h3>
                <Toggle label="Fazer a base de LED" checked={!!led} onChange={(on) => setL("led")(on ? DEFAULT_LED : null)} hint="Uma base com encaixe para a peça, lugar para o LED e tampa de baixo. Imprima em outra cor ou na mesma." />
                {led && (
                  <>
                    <Segmented label="Tipo de LED" value={led.kind} options={LED_KINDS} onChange={(kind) => setL("led")({ ...led, kind, size: kind === "disc" ? 50 : 10 })} full />
                    <NumField label={led.kind === "disc" ? "Diâmetro do disco" : "Largura da fita"} value={led.size} onChange={(size) => setL("led")({ ...led, size })} min={led.kind === "disc" ? 15 : 4} max={led.kind === "disc" ? 120 : 20} step={1} />
                    <Segmented label="Alimentação" value={led.power} options={LED_POWER} onChange={(power) => setL("led")({ ...led, power })} full />
                    <span className="hint">{led.power === "cable" ? "Sai um furo de 5 mm atrás para o cabo." : "Compartimento para 2 pilhas AAA atrás, fechado pela tampa de baixo."} A tampa de baixo encaixa por atrito; um pingo de cola ou fita segura. A base aguenta preenchimento de 15% a 20% no fatiador.</span>
                  </>
                )}
              </div>
            )}
            </>
          ) : mode === "relief" ? (
            <ReliefPanel relief={relief} setRelief={setRelief} />
          ) : mode === "color" ? (
            <ColorLithoPanel color={color} setColor={setColor} filColors={filColors} />
          ) : (
            <LayeredPanel layered={layered} setLayered={setLayered} filColors={filColors} colors={colors} nameOf={nameOf} thumb={thumb} />
          )}
          {/* template (#139): ajuste fino recolhido */}
          <details className="advanced">
            <summary>Opções avançadas</summary>
            <div className="grid two">
              <NumField label="Detalhe" value={cell} onChange={setCell} min={0.15} max={1} step={0.05} hint="mm por ponto: menor = mais nítido e mais pesado." />
              {mode === "color" && (
                <>
                  <NumField label="Tinta máxima" value={color.maxInk} onChange={(maxInk) => setColor((o) => ({ ...o, maxInk }))} min={0.4} max={4} step={0.1} hint="mm de ciano, magenta e amarelo no escuro." />
                  <NumField label="Branco de difusão" value={color.whiteT} onChange={(whiteT) => setColor((o) => ({ ...o, whiteT }))} min={0.4} max={3} step={0.1} />
                  <NumField label="Moldura" value={color.border} onChange={(border) => setColor((o) => ({ ...o, border }))} min={3} max={15} step={0.5} />
                </>
              )}
              {mode === "litho" && (
                <>
                  <NumField label="Espessura mínima" value={litho.minT} onChange={setL("minT")} min={0.4} max={3} hint="No branco: mais luz passa." />
                  <NumField label="Espessura máxima" value={litho.maxT} onChange={setL("maxT")} min={1} max={8} hint="No preto." />
                  <NumField label="Moldura" value={litho.border} onChange={setL("border")} min={0} max={15} step={0.5} />
                  {litho.shape === "curved" && <NumField label="Arco" value={litho.arc} onChange={setL("arc")} min={30} max={270} step={5} unit="°" />}
                </>
              )}
            </div>
          </details>
          <ExportButtons printModes={mode === "layered" || mode === "color"} modes={["ams", "plates"]} models={models.length ? exportModels : []} name={mode === "litho" ? "litofania" : mode === "color" ? "litofania-colorida" : mode === "relief" ? "relevo" : "quadro-camadas"} busy={busy} pauses={pauses} profile={mode === "litho" ? LITHO_PROFILE : mode === "color" ? COLOR_LITHO_PROFILE : mode === "relief" ? RELIEF_PROFILE : { ...LAYERED_PROFILE, layerHeight: layered.layerHeight }} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          {(mode === "litho" || mode === "color") && <Segmented label="Prévia" value={view} options={VIEWS} onChange={setView} />}
          {(mode === "litho" || mode === "color") && view === "light" ? (
            <div className="pair">
              <figure>
                <figcaption>Original</figcaption>
                <div className="img checker">{original ? <img src={original} alt="Foto original" /> : <span className="muted">Nenhuma foto</span>}</div>
              </figure>
              <figure>
                <figcaption>
                  <span>Contra a luz</span>
                  {busy && <span className="muted">atualizando…</span>}
                </figcaption>
                <div className="img dark-box">
                  {backlit && file ? <img className="fit" src={backlit} alt="Simulação da litofania contra a luz" /> : <span className="muted">{error ?? "Envie uma foto para ver o relevo."}</span>}
                </div>
              </figure>
            </div>
          ) : (
            <Preview3D models={models} busy={busy} busyText="Gerando relevo…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : "Envie uma foto para ver o relevo."} />
          )}
          {mode === "layered" && swaps.length > 0 && models.length > 0 && (
            <div className="card stack" aria-label="Trocas de filamento">
              <h3>Trocas de filamento</h3>
              <ol className="stack">
                <li>
                  Comece com <Swatch hex={models[0].parts[0].color} label={nameOf(models[0].parts[0].color)} /> até a camada {swaps[0].layer - 1}.
                </li>
                {magnetZ !== undefined && (
                  <li>
                    Camada {Math.round(magnetZ / layered.layerHeight)} (Z = {mmText(magnetZ)} mm): a impressora pausa; coloque o ímã no encaixe e continue.
                  </li>
                )}
                {swaps.map((s) => (
                  <li key={s.z}>
                    Camada {s.layer} (Z = {mmText(s.z)} mm): troque para <Swatch hex={s.color} label={nameOf(s.color)} />
                  </li>
                ))}
              </ol>
            </div>
          )}
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}

function Swatch({ hex, label }: { hex: string; label: string }) {
  return (
    <span className="swatch-inline">
      <i style={{ background: hex }} />
      {label}
    </span>
  );
}

/** Claro reduzido para as miniaturas das paletas (até THUMB_W pontos de largura). */
function thumbOf(luma: Float32Array, w: number, h: number): Thumb {
  const step = Math.max(1, Math.ceil(w / THUMB_W));
  const tw = Math.ceil(w / step), th = Math.ceil(h / step);
  const out = new Float32Array(tw * th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) out[y * tw + x] = luma[y * step * w + x * step];
  return { luma: out, w: tw, h: th };
}
