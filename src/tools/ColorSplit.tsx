import { useEffect, useMemo, useState } from "react";
import { getDb } from "../db";
import { filaments as filamentsRepo } from "../db/repo";
import type { Filament } from "../domain/entities";
import { densityOfMaterial } from "../domain/estimate";
import { money } from "../domain/format";
import { capitalized, colorName } from "../geometry/colorName";
import { colorSwatch } from "../ui/ColorDots";
import { filamentLabel, suggestFilament } from "./filamentSuggest";
import { autoSelections, colorClusters, colorPreview, DEFAULT_TOLERANCE, hasMaterialColors, nearestTriangle, sameColor, type ColorSelection } from "../geometry/colorRegions";
import { splitByColor, type SplitMode } from "../geometry/colorSplit";
import { getManifold } from "../geometry/manifold";
import { cutInParts, cutModels, DEFAULT_CUT, MAX_CUT_PARTS, type CutAxis, type CutOptions, type PinMode, type PinShape } from "../geometry/planeCut";
import { read3mf, type Read3mf } from "../geometry/threemfRead";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import Slider from "../ui/Slider";
import Toggle from "../ui/Toggle";
import { restoreBytes, storeBytes } from "./storedFile";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";
import { useModelBuilder } from "../ui/useModelBuilder";
import GeneratorHelp from "./models/guide/GeneratorHelp";
import { TOOL_HELP } from "./models/help/toolHelp";

const MODES: [SplitMode, string][] = [
  ["parts", "Partes (multicor)"],
  ["objects", "Objetos separados"],
];
const AXES: [CutAxis, string][] = [
  ["z", "Horizontal (Z)"],
  ["x", "Vertical (X)"],
  ["y", "Vertical (Y)"],
];
const PINS: [PinShape, string][] = [
  ["round", "Redondo"],
  ["square", "Quadrado"],
  ["triangle", "Triângulo"],
  ["none", "Sem encaixe"],
];
const PIN_MODES: [PinMode, string][] = [
  ["loose", "Pino solto"],
  ["fixed", "Pino fixo na parte A"],
];
const MAX_BYTES = 200 * 1024 * 1024;

const initialState = () => ({
  file: null as { name: string; bytes: Uint8Array } | null,
  depth: 1,
  mode: "parts" as SplitMode,
  cutOn: false,
  cut: DEFAULT_CUT as CutOptions,
  cutParts: 2,
  keepPosition: false,
  tolerance: DEFAULT_TOLERANCE,
  /** Cores escolhidas para separar; null = automático (todas menos a maior). */
  picks: null as ColorSelection[] | null,
  touching: true,
  /** Filamento escolhido para cada cor (id do cadastro; null = nenhum). Sem escolha vale o mais parecido. */
  assign: {} as Record<string, number | null>,
});
type SplitState = ReturnType<typeof initialState>;

/** Separador 3MF por cor (#14): lê a pintura do Bambu Studio / OrcaSlicer / PrusaSlicer e separa em volumes por cor. */
export default function ColorSplit() {
  // estado de trabalho: desfazer, rascunho guardado (o 3MF vai junto até 4 MB) e últimos projetos (#85)
  const tool = useToolState("colorsplit", initialState, {
    label: "Separar 3MF",
    save: (s) => ({ ...s, file: s.file && { name: s.file.name, bytes: storeBytes(s.file.bytes) } }),
    load: (raw) => {
      const r = raw as Omit<SplitState, "file"> & { file: { name: string; bytes: string | null } | null };
      const bytes = restoreBytes(r.file?.bytes);
      return { ...initialState(), ...r, file: r.file && bytes ? { name: r.file.name, bytes } : null };
    },
  });
  const { file, depth, mode, cutOn, cut, cutParts, keepPosition, tolerance, picks, touching, assign } = tool.state;
  const [setFile, setDepth, setMode, setCutOn, setCut, setCutParts, setKeep, setTol, setPicks, setTouching, setAssign] = [tool.field("file"), tool.field("depth"), tool.field("mode"), tool.field("cutOn"), tool.field("cut"), tool.field("cutParts"), tool.field("keepPosition"), tool.field("tolerance"), tool.field("picks"), tool.field("touching"), tool.field("assign")];
  const [stock, setStock] = useState<Filament[]>([]);
  useEffect(() => {
    getDb()
      .then(filamentsRepo.list)
      .then(setStock)
      .catch(() => {}); // sem banco (prévia solta): só os nomes das cores
  }, []);
  /** O filamento da cor: o que a pessoa escolheu ou, sem escolha, o cadastrado mais parecido. */
  const chosenFor = (color: string): { filament: Filament; swatch: string } | null => {
    const key = color.toLowerCase();
    if (key in assign) {
      const f = assign[key] === null ? undefined : stock.find((x) => x.id === assign[key]);
      const swatch = f ? colorSwatch(f.color) : null;
      return f && swatch ? { filament: f, swatch } : null;
    }
    return suggestFilament(key, stock);
  };
  const [view, setView] = useState<"result" | "original">("result");
  const [pickNote, setPickNote] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const setC = <K extends keyof CutOptions>(key: K) => (v: CutOptions[K]) => setCut((c) => ({ ...c, [key]: v }));
  const [colors, setColors] = useState<{ filament: number; color: string; volume: number }[]>([]);

  async function onFile(f: File) {
    setFileError(null);
    if (!f.name.toLowerCase().endsWith(".3mf")) return setFileError("Envie o arquivo .3mf (STL não guarda a pintura por cor).");
    if (f.size > MAX_BYTES) return setFileError("Arquivo maior que 200 MB.");
    setPicks(null);
    setFile({ name: f.name.replace(/\.3mf$/i, ""), bytes: new Uint8Array(await f.arrayBuffer()) });
  }

  // o arquivo lido (só muda quando troca o arquivo) e, se pinta por material, os grupos de cor dele
  const parsed = useMemo<{ read: Read3mf } | { error: string }>(() => {
    if (!file) return { error: "" };
    try {
      return { read: read3mf(file.bytes) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [file]);
  const read = "read" in parsed ? parsed.read : null;
  const byMaterial = !!read && hasMaterialColors(read);
  const clusters = useMemo(() => (read && byMaterial ? colorClusters(read, tolerance) : []), [read, byMaterial, tolerance]);
  const selected = byMaterial ? (picks ?? autoSelections(clusters)) : [];
  const isSelected = (color: string) => selected.some((s) => sameColor(s.color, color, tolerance));

  const toggleCluster = (color: string) =>
    setPicks(isSelected(color) ? selected.filter((s) => !sameColor(s.color, color, tolerance)) : [...selected, { color, scope: "all" }]);

  function onPick(hit: { point: [number, number, number] }) {
    if (!read) return;
    setPickNote(null);
    const t = nearestTriangle(read, hit.point);
    const cluster = t?.color ? clusters.find((c) => sameColor(c.color, t.color!, tolerance)) : null;
    if (!t || !cluster) return setPickNote("Esse trecho não tem cor de material: clique numa área colorida.");
    if (isSelected(cluster.color) && selected.some((s) => s.scope === "all" && sameColor(s.color, cluster.color, tolerance))) return toggleCluster(cluster.color);
    setPicks([...selected, { color: cluster.color, scope: touching ? "touching" : "all", seed: { obj: t.obj, part: t.part, tri: t.tri } }]);
  }

  const valid = inRange(depth, 0.2, 10) && (!cutOn || (inRange(cut.clearance, 0, 1) && (cut.size === 0 || inRange(cut.size, 2, 30)) && inRange(cutParts, 2, MAX_CUT_PARTS)));
  const { models, warnings, busy, error } = useModelBuilder(async () => {
    if (!read || !valid) return null;
    const M = await getManifold();
    const out = splitByColor(M, read, { depth, mode, selections: byMaterial ? selected : undefined, tolerance, keepPosition });
    setColors(out.colors);
    // com filamento cadastrado a peça sai na cor dele: o arquivo, o peso e o custo usam o filamento escolhido
    const recolor = (list: typeof out.models) => list.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p, color: chosenFor(p.color)?.swatch ?? p.color })) }));
    if (!cutOn) return { models: recolor(out.models), warnings: out.warnings };
    const c = cutParts === 2 ? cutModels(M, out.models, cut) : cutInParts(M, out.models, cut, cutParts);
    return { models: recolor(c.models), warnings: [...out.warnings, ...c.warnings] };
  }, [read, depth, mode, valid, cutOn, cut, cutParts, keepPosition, tolerance, picks, byMaterial, stock, assign]);
  const original = useMemo(() => (read && byMaterial ? colorPreview(read, tolerance, selected) : []), [read, byMaterial, tolerance, picks, clusters]); // eslint-disable-line react-hooks/exhaustive-deps
  const showOriginal = byMaterial && view === "original";

  return (
    <div className="page">
      <h1>Separar cores de um 3MF</h1>
      <p className="lead">3MF colorido vira uma peça sólida por cor.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Arquivo</h3>
            <Dropzone accept=".3mf" label={file ? `${file.name}.3mf` : "Arraste o .3mf pintado"} hint="Pintura por cor (pincel) ou partes de cores diferentes." onFile={onFile} />
            {fileError && <Alert kind="error">{fileError}</Alert>}
            {"error" in parsed && parsed.error && <Alert kind="error">{parsed.error}</Alert>}
          </div>
          {byMaterial && (
            <div className="card stack" aria-label="Cores do arquivo">
              <h3>Cores do arquivo</h3>
              <p className="hint">Este 3MF pinta por material. Cores parecidas viram um grupo; escolha quais viram peça separada (a maior fica como base). Para escolher na peça, use a vista “Original” e clique na cor.</p>
              <Slider label="Tolerância entre cores" min={0} max={30} value={tolerance} display={(v) => `${v}%`} onChange={setTol} />
              <ul className="stack">
                {clusters.map((c, i) => (
                  <li key={c.color}>
                    <button type="button" className={isSelected(c.color) ? "sm primary" : "sm"} aria-pressed={isSelected(c.color)} onClick={() => toggleCluster(c.color)}>
                      <span className="swatch-inline">
                        <i style={{ background: c.color }} aria-hidden />
                        {isSelected(c.color) ? "Separar" : i === 0 ? "Base" : "Fica na base"}
                      </span>
                    </button>{" "}
                    <span className="muted" title={c.color}>
                      {capitalized(colorName(c.color))} · {Math.round(c.share * 100)}% da superfície
                    </span>
                  </li>
                ))}
              </ul>
              <Toggle label="O clique pega só a região que toca (em vez de todas as áreas dessa cor)" checked={touching} onChange={setTouching} />
              {picks && (
                <button type="button" className="sm" onClick={() => setPicks(null)}>
                  Voltar ao automático
                </button>
              )}
            </div>
          )}
          <div className="card stack">
            <h3>Separação</h3>
            <div>
              <span className="field-label">Saída</span>
              <Segmented label="Saída" value={mode} options={MODES} onChange={setMode} full />
            </div>
            {mode === "objects" && <Toggle label="Manter a posição original (sem afastar nem apoiar na mesa)" checked={keepPosition} onChange={setKeep} />}
            <span className="hint">{mode === "parts" ? "Um objeto com uma parte por cor: o fatiador troca de filamento (AMS)." : "Cada cor vira um objeto separado, apoiado na mesa: imprime cada um na sua cor e cola."}</span>
          </div>
          <div className="card stack">
            <h3>Corte</h3>
            <Toggle label="Cortar com encaixe (peça maior que a mesa ou para montar)" checked={cutOn} onChange={setCutOn} />
            {cutOn && (
              <>
                <div>
                  <span className="field-label">Plano de corte</span>
                  <Segmented label="Plano de corte" value={cut.axis} options={AXES} onChange={setC("axis")} full />
                </div>
                <NumField label="Número de partes" unit="partes" value={cutParts} onChange={setCutParts} min={2} max={MAX_CUT_PARTS} step={1} hint="Partes iguais, uma depois da outra, com encaixe em cada junta." />
                {cutParts === 2 && <Slider label="Posição do corte" min={5} max={95} value={Math.round(cut.at * 100)} display={(v) => `${v}%`} onChange={(v) => setC("at")(v / 100)} />}
                <div>
                  <span className="field-label">Encaixe</span>
                  <Segmented label="Encaixe" value={cut.pin} options={PINS} onChange={setC("pin")} full />
                </div>
                {cut.pin !== "none" && (
                  <>
                    <Segmented label="Tipo de pino" value={cut.mode} options={PIN_MODES} onChange={setC("mode")} full />
                    <div className="grid two">
                      <NumField label="Tamanho do pino" value={cut.size} onChange={setC("size")} min={0} max={30} step={0.5} hint="0 = automático" />
                      <NumField label="Folga do encaixe" value={cut.clearance} onChange={setC("clearance")} min={0} max={1} step={0.05} hint="0,2 costuma entrar justo." />
                    </div>
                    <span className="hint">
                      {cut.mode === "loose" ? "As duas partes vão com a face cortada na mesa; os pinos saem à parte." : "O pino sai da parte A, impressa em pé; a parte B tem o furo."}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
          <details className="advanced">
            <summary>Opções avançadas</summary>
            <div className="stack">
              <NumField label="Profundidade da cor" value={depth} onChange={setDepth} min={0.2} max={10} step={0.1} hint="Quanto cada cor pintada entra na peça. 1 mm cobre bem com 2–3 camadas por cima." />
            </div>
          </details>
          {colors.length > 0 && models.length > 0 && (
            <div className="card stack" aria-label="Cores encontradas">
              <h3>Cores encontradas</h3>
              <ul className="stack">
                {colors.map((c) => {
                  const chosen = chosenFor(c.color);
                  const suggested = suggestFilament(c.color.toLowerCase(), stock);
                  const material = chosen?.filament.material;
                  const g = (c.volume / 1000) * densityOfMaterial(material);
                  const cost = chosen ? (g / 1000) * chosen.filament.pricePerKg : null;
                  return (
                    <li key={c.filament} className="stack">
                      <span className="swatch-inline" title={`Código da cor: ${c.color}`}>
                        <i style={{ background: chosen?.swatch ?? c.color }} aria-hidden />
                        <strong>{capitalized(colorName(c.color))}</strong>
                      </span>
                      <span className="muted">
                        {!byMaterial && `Filamento ${c.filament} do arquivo · `}
                        {(c.volume / 1000).toFixed(1).replace(".", ",")} cm³ · ~{Math.round(g)} g de {material ?? "PLA"} (maciço)
                        {cost !== null && ` · ~${money(cost)}`}
                      </span>
                      {stock.length > 0 && (
                        <label className="field">
                          <span className="field-label">Filamento{suggested && chosen?.filament.id === suggested.filament.id ? ` (parece com: ${filamentLabel(suggested.filament)})` : ""}</span>
                          <select
                            aria-label={`Filamento para ${colorName(c.color)}`}
                            value={chosen?.filament.id ?? ""}
                            onChange={(e) => setAssign((cur) => ({ ...cur, [c.color.toLowerCase()]: e.target.value ? Number(e.target.value) : null }))}
                          >
                            <option value="">Nenhum cadastrado (usar a cor do arquivo)</option>
                            {stock.map((f) => (
                              <option key={f.id} value={f.id}>
                                {filamentLabel(f)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {stock.length > 0 && !chosen && <span className="hint">Nenhum filamento cadastrado parecido: o peso usa PLA e o custo fica de fora.</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <ExportButtons models={models} name={`${file?.name ?? "separado"}-cores`} busy={busy} onSaved={tool.exported} tips={TOOL_HELP.colorsplit.tips} />
          <GeneratorHelp help={TOOL_HELP.colorsplit} />
        </div>
        <div className="preview-col">
          {byMaterial && (
            <Segmented
              label="Vista"
              value={view}
              options={[
                ["result", "Resultado"],
                ["original", "Original (clique numa cor)"],
              ]}
              onChange={setView}
            />
          )}
          {pickNote && <Alert kind="warn">{pickNote}</Alert>}
          <Preview3D
            models={showOriginal ? original : models}
            busy={busy && !showOriginal}
            busyText="Separando as cores…"
            error={error}
            emptyText={!valid ? "Corrija os campos em vermelho." : "Envie um 3MF pintado para separar as cores."}
            onPick={showOriginal ? onPick : undefined}
          />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
