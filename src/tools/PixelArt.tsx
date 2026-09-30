import { useMemo, useState } from "react";
import type { Filament } from "../domain/entities";
import { loadFont } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import { buildPixelArt, colorCounts, DEFAULT_PIXEL_OPTIONS, MAX_SIZE, MIN_SIZE, pixelate, replaceColor, type PixelGrid, type PixelOptions, type PixelOutput } from "../geometry/pixelArt";
import { textToCrossSection } from "../geometry/text";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import { useData } from "../ui/useData";
import { useModelBuilder } from "../ui/useModelBuilder";
import { IMAGE_ACCEPT, loadRaster } from "../vectorize/client";
import { filamentColors, loadFilaments, type FilamentColor } from "./filamentColors";
import PixelEditor from "./pixel/PixelEditor";
import { restoreFile, storeFile, type StoredFile } from "./storedFile";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

const OUTPUTS: [PixelOutput, string][] = [
  ["mosaic", "Mosaico"],
  ["puzzle", "Quebra-cabeça"],
  ["magnet", "Ímã"],
];
const MARKS: [PixelOptions["marks"], string][] = [
  ["number", "Número"],
  ["color", "Cor"],
  ["none", "Nada"],
];
type View = "grid" | "3d";
const VIEWS: [View, string][] = [
  ["grid", "Grade"],
  ["3d", "3D"],
];
// sem filamento cadastrado: cores comuns de PLA
const FALLBACK: FilamentColor[] = [
  ["#1c1c1e", "Preto"],
  ["#f8f8f6", "Branco"],
  ["#d62828", "Vermelho"],
  ["#f7c52b", "Amarelo"],
  ["#1d4ed8", "Azul"],
  ["#16a34a", "Verde"],
  ["#f97316", "Laranja"],
  ["#8a8f98", "Cinza"],
].map(([hex, label]) => ({ hex, label }));
const FONT = "hanken";

const initialState = () => ({ file: null as File | null, size: 32, colors: 6, grid: null as PixelGrid | null, opts: DEFAULT_PIXEL_OPTIONS });
type PixelState = ReturnType<typeof initialState>;

/** Pixel art (#95): imagem → grade com as cores dos filamentos, editor de pixels e mosaico, quebra-cabeça ou ímã. */
export default function PixelArt() {
  const tool = useToolState("pixel", initialState, {
    label: "Pixel art",
    save: async (s) => ({ ...s, file: await storeFile(s.file) }),
    load: async (raw) => {
      const r = raw as Omit<PixelState, "file"> & { file?: StoredFile | null };
      return { ...r, file: await restoreFile(r.file) };
    },
  });
  const { file, size, colors, grid, opts } = tool.state;
  const [setSize, setColors, setGrid, setOpts] = [tool.field("size"), tool.field("colors"), tool.field("grid"), tool.field("opts")];
  const [rows] = useData(loadFilaments, [] as Filament[]);
  const registered = useMemo(() => filamentColors(rows), [rows]);
  const palette = registered.length ? registered : FALLBACK;
  const nameOf = (hex: string) => palette.find((f) => f.hex === hex)?.label ?? hex;
  const [brush, setBrush] = useState<string | null>(palette[0].hex);
  const [view, setView] = useState<View>("grid");
  const [loadError, setLoadError] = useState<string | null>(null);
  const setO = <K extends keyof PixelOptions>(k: K) => (v: PixelOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  async function makeGrid(f: File | null, n = size, c = colors) {
    if (!f) return;
    setLoadError(null);
    try {
      const r = await loadRaster(f, (w, h) => Math.min(1, (MAX_SIZE * 8) / Math.max(w, h)));
      URL.revokeObjectURL(r.url);
      const g = pixelate(r.rgba, r.w, r.h, n, c, registered.length ? registered.map((x) => x.hex) : FALLBACK.map((x) => x.hex));
      tool.set((s) => ({ ...s, file: f, grid: g }));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Não consegui ler a imagem.");
    }
  }
  const blank = () => setGrid({ cols: size, rows: size, cells: Array(size * size).fill(-1), palette: [] });

  const valid =
    inRange(size, MIN_SIZE, MAX_SIZE) &&
    inRange(colors, 2, 8) &&
    inRange(opts.pixel, 3, 20) &&
    (opts.output === "puzzle" ? inRange(opts.pocket, 1, 5) && inRange(opts.clearance, 0.1, 0.5) : inRange(opts.base, 0, 5) && inRange(opts.relief, 0.4, 4) && inRange(opts.border, 0, 10)) &&
    (opts.output !== "magnet" || (inRange(opts.magnetD, 4, 30) && inRange(opts.magnetH, 1, 6)));

  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!grid || !valid || !grid.cells.some((v) => v >= 0)) return null;
    const M = await getManifold();
    // a fonte só serve para os números do quebra-cabeça
    const font = opts.output === "puzzle" && opts.marks === "number" ? await loadFont(FONT) : null;
    return buildPixelArt(M, grid, opts, (s, h) => (font && s.trim() ? textToCrossSection(M, font, s, h) : null));
  }, [grid, opts, valid]);

  const counts = grid ? colorCounts(grid) : [];
  const legend = grid ? grid.palette.map((hex, i) => ({ hex, i, n: counts[i] })).filter((c) => c.n > 0) : [];

  return (
    <div className="page">
      <h1>Pixel art</h1>
      <p className="lead">Imagem vira grade de pixels nas cores dos seus filamentos: mosaico, quebra-cabeça com pixels soltos ou ímã de geladeira.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <Dropzone accept={IMAGE_ACCEPT} label={file ? file.name : "Arraste uma imagem ou clique"} hint="Desenhos simples, ícones e personagens próprios ficam melhores." onFile={(f) => void makeGrid(f)} />
            <div className="grid two">
              <NumField label="Pixels no lado maior" value={size} onChange={setSize} min={MIN_SIZE} max={MAX_SIZE} step={1} unit="" />
              <NumField label="Cores" value={colors} onChange={setColors} min={2} max={8} step={1} unit="" hint={registered.length ? "Trocadas pelos filamentos cadastrados." : "Cadastre filamentos para usar as suas cores."} />
            </div>
            <div className="row">
              <button type="button" disabled={!file || !valid} onClick={() => void makeGrid(file)}>
                Refazer a grade
              </button>
              <button type="button" className="ghost" disabled={!valid} onClick={blank}>
                Começar em branco
              </button>
            </div>
            <span className="hint">Refazer apaga o que você pintou (dá para desfazer).</span>
          </div>
          <div className="card stack">
            <Segmented label="Saída" value={opts.output} options={OUTPUTS} onChange={setO("output")} full />
            <div className="grid two">
              <NumField label="Pixel" value={opts.pixel} onChange={setO("pixel")} min={3} max={20} step={0.5} />
              {opts.output === "puzzle" ? (
                <>
                  <NumField label="Encaixe" value={opts.pocket} onChange={setO("pocket")} min={1} max={5} hint="Profundidade da bandeja." />
                  <NumField label="Folga" value={opts.clearance} onChange={setO("clearance")} min={0.1} max={0.5} step={0.05} hint="0,2 entra justo; aumente se prender." />
                </>
              ) : (
                <>
                  <NumField label="Fundo" value={opts.base} onChange={setO("base")} min={0} max={5} />
                  <NumField label="Relevo" value={opts.relief} onChange={setO("relief")} min={0.4} max={4} />
                  <NumField label="Borda" value={opts.border} onChange={setO("border")} min={0} max={10} step={0.5} />
                </>
              )}
              {opts.output === "magnet" && (
                <>
                  <NumField label="Ímã: diâmetro" value={opts.magnetD} onChange={setO("magnetD")} min={4} max={30} step={0.5} />
                  <NumField label="Ímã: altura" value={opts.magnetH} onChange={setO("magnetH")} min={1} max={6} step={0.5} />
                </>
              )}
            </div>
            {opts.output === "puzzle" && <Segmented label="Marca em cada casa" value={opts.marks} options={MARKS} onChange={setO("marks")} full />}
            <span className="hint">
              {opts.output === "puzzle"
                ? "A bandeja sai numa peça e os pixels de cada cor num objeto próprio: dá para imprimir uma cor de cada vez, sem AMS."
                : opts.output === "magnet"
                  ? "O furo do ímã fica embaixo, aberto: imprima, encaixe o ímã com uma gota de cola."
                  : "Uma peça multicor: o fundo e uma parte por cor em cima."}
            </span>
          </div>
          <ExportButtons models={models} name="pixel-art" busy={busy} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Segmented label="Prévia" value={view} options={VIEWS} onChange={setView} />
          {view === "grid" ? (
            <div className="card stack">
              {grid ? <PixelEditor grid={grid} brush={brush} onChange={(g) => setGrid(g)} /> : <span className="muted">Envie uma imagem ou comece em branco.</span>}
              <span className="field-label">Pincel</span>
              <div className="pixel-brushes" role="group" aria-label="Pincel">
                {palette.map((f) => (
                  <button key={f.hex} type="button" className="pixel-brush" aria-pressed={brush === f.hex} onClick={() => setBrush(f.hex)}>
                    <span className="swatch-inline">
                      <i style={{ background: f.hex }} />
                      {f.label}
                    </span>
                  </button>
                ))}
                <button type="button" className="pixel-brush" aria-pressed={brush === null} onClick={() => setBrush(null)}>
                  Apagar
                </button>
              </div>
            </div>
          ) : (
            <Preview3D models={models} busy={busy} busyText="Gerando peças…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : "Envie uma imagem ou pinte a grade."} />
          )}
          {grid && legend.length > 0 && (
            <div className="card stack" aria-label="Legenda das cores">
              <h3>Cores</h3>
              <ol className="pixel-legend">
                {legend.map((c) => (
                  <li key={c.hex}>
                    <span className="swatch-inline">
                      <i style={{ background: c.hex }} />
                      <strong>{c.i + 1}</strong> {nameOf(c.hex)} · {c.n} pixels
                    </span>
                    <label>
                      Trocar por{" "}
                      <select value={c.hex} onChange={(e) => setGrid(replaceColor(grid, c.i, e.target.value))}>
                        {[...new Set([c.hex, ...palette.map((f) => f.hex)])].map((hex) => (
                          <option key={hex} value={hex}>
                            {nameOf(hex)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {loadError && <Alert kind="error">{loadError}</Alert>}
          {warnings.map((w) => (
            <Alert key={w} kind="warn">
              {w}
            </Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
