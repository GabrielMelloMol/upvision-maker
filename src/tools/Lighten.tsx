import { useMemo, useState } from "react";
import { meshBounds } from "../geometry/bounds";
import { readOwnFile } from "../geometry/ownModel";
import { CORE_KINDS, DEFAULT_LIGHTEN, massGrams, type CoreKind, type LightenOpts } from "../geometry/lighten";
import { LightenCancelled, lightenAsync } from "../geometry/lightenClient";
import type { LightenResult, LightenSource } from "../geometry/lightenWorker";
import type { Model } from "../geometry/types";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import Slider from "../ui/Slider";
import Toggle from "../ui/Toggle";
import { errorText } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import LightenCompare, { type Compared } from "./lighten/LightenCompare";
import { restoreBytes, storeBytes } from "./storedFile";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

type Mode = "part" | "block";
type State = { mode: Mode; file: { name: string; bytes: Uint8Array } | null; opts: LightenOpts; size: [number, number, number]; inside: boolean };
const initialState: State = { mode: "part", file: null, opts: DEFAULT_LIGHTEN, size: [60, 40, 30], inside: false };

const MODES: [Mode, string][] = [
  ["part", "Alivianar uma peça (STL ou 3MF)"],
  ["block", "Bloco de treliça"],
];
const MAX_BYTES = 100 * 1024 * 1024;
const MANY_TRIANGLES = 150_000;
const MIN_WALL_PART = 0.8;
const fmt = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Miolo leve (#236): troca o miolo de uma peça por giroide, voronoi ou treliça cúbica, deixando uma casca maciça, e compara as 3
 * estruturas em massa e menor seção. Também gera um bloco de treliça. Tudo em PLA; nada aqui substitui um teste de resistência.
 */
export default function Lighten() {
  const tool = useToolState("lighten", initialState, {
    label: "Miolo leve",
    save: (s) => ({ ...s, file: s.file && { name: s.file.name, bytes: storeBytes(s.file.bytes) } }),
    load: (raw) => {
      const r = raw as State & { file: { name: string; bytes: string | null } | null };
      const bytes = restoreBytes(r.file?.bytes);
      return { ...initialState, ...r, opts: { ...DEFAULT_LIGHTEN, ...r.opts }, file: r.file && bytes ? { name: r.file.name, bytes } : null };
    },
  });
  const { mode, file, opts, size, inside } = tool.state;
  const [fileError, setFileError] = useState<string | null>(null);
  const [compared, setCompared] = useState<{ key: string; rows: Compared[] } | null>(null);
  const [comparing, setComparing] = useState<string | null>(null);

  const parsed = useMemo<{ model: Model; triangles: number } | { error: string } | null>(() => {
    if (!file) return null;
    try {
      const model = readOwnFile(file.bytes, file.name);
      return { model, triangles: model.parts.reduce((n, p) => n + p.mesh.indices.length / 3, 0) };
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [file]);
  const model = parsed && "model" in parsed ? parsed.model : null;
  const baseName = file?.name.replace(/\.[^.]+$/, "") ?? "bloco";

  const minWall = mode === "part" ? MIN_WALL_PART : 0;
  const valid = inRange(opts.cell, 4, 30) && inRange(opts.strut, 0.6, 5) && inRange(opts.wall, minWall, 8) && (mode === "part" || size.every((v) => inRange(v, 10, 200)));
  const source: LightenSource | null = mode === "block" ? { kind: "block", size } : model ? { kind: "model", model } : null;
  const key = JSON.stringify({ mode, f: file && [file.name, file.bytes.length], opts, size });
  // a comparação vale para qualquer tipo de estrutura: trocar o tipo (inclusive por "Usar esta") não a invalida
  const compareKey = JSON.stringify({ mode, f: file && [file.name, file.bytes.length], opts: { ...opts, kind: null }, size });

  const { models, view, warnings, busy, error } = useModelBuilder<LightenResult>(async () => {
    if (!source || !valid) return null;
    try {
      const r = await lightenAsync(source, opts);
      return { models: [r.model], warnings: r.warnings, view: r };
    } catch (e) {
      if (e instanceof LightenCancelled) return null;
      throw e;
    }
  }, [key, valid]);

  async function onFile(f: File) {
    setFileError(null);
    if (!/\.(stl|3mf)$/i.test(f.name)) return setFileError("Envie um arquivo .stl ou .3mf.");
    if (f.size > MAX_BYTES) return setFileError("Arquivo maior que 100 MB.");
    const bytes = new Uint8Array(await f.arrayBuffer());
    try {
      if (!meshBounds(readOwnFile(bytes, f.name).parts.map((p) => p.mesh))) return setFileError("O arquivo está vazio.");
      tool.set((cur) => ({ ...cur, file: { name: f.name, bytes } }), "file");
    } catch (e) {
      setFileError(errorText(e));
    }
  }

  async function compare() {
    if (!source || !valid) return;
    const rows: Compared[] = [];
    try {
      for (const [kind, label] of CORE_KINDS) {
        setComparing(`Calculando ${label}… (${rows.length + 1} de ${CORE_KINDS.length})`);
        rows.push({ kind, stats: (await lightenAsync(source, { ...opts, kind })).stats });
      }
      setCompared({ key: compareKey, rows });
    } catch (e) {
      if (!(e instanceof LightenCancelled)) setFileError(errorText(e));
    } finally {
      setComparing(null);
    }
  }

  const setOpt = <K extends keyof LightenOpts>(k: K) => (v: LightenOpts[K]) => tool.set((s) => ({ ...s, opts: { ...s.opts, [k]: v } }), `opt:${k}`);
  const setKind = (k: CoreKind) => setOpt("kind")(k);
  const stats = view?.stats;
  const shown = view ? [inside ? view.section : view.model] : [];

  return (
    <div className="page">
      <h1>Miolo leve</h1>
      <p className="lead">Troca o miolo da peça por giroide, voronoi ou treliça.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <Segmented label="O que fazer" value={mode} options={MODES} onChange={(m) => tool.set((s) => ({ ...s, mode: m, opts: { ...s.opts, wall: m === "block" ? 0 : Math.max(s.opts.wall, MIN_WALL_PART) } }), "mode")} full />
            {mode === "part" ? (
              <>
                <Dropzone accept=".stl,.3mf" label={file ? file.name : "Arraste o .stl ou .3mf"} hint="Um sólido fechado (sem furos na malha)." onFile={onFile} />
                {fileError && <Alert kind="error">{fileError}</Alert>}
                {parsed && "error" in parsed && <Alert kind="error">{parsed.error}</Alert>}
                {parsed && "triangles" in parsed && parsed.triangles > MANY_TRIANGLES && <Alert kind="warn">A peça tem {parsed.triangles.toLocaleString("pt-BR")} triângulos: o cálculo pode levar alguns minutos.</Alert>}
                <Alert kind="warn">Use só modelos que são seus ou cuja licença permite alterar e imprimir. O app não confere a licença do arquivo.</Alert>
              </>
            ) : (
              <div className="grid three">
                {(["Largura", "Profundidade", "Altura"] as const).map((label, i) => (
                  <NumField key={label} label={label} value={size[i]} onChange={(v) => tool.set((s) => ({ ...s, size: s.size.map((x, j) => (j === i ? v : x)) as State["size"] }), `size:${i}`)} min={10} max={200} step={1} />
                ))}
              </div>
            )}
          </div>
          <div className="card stack">
            <h3>Estrutura do miolo</h3>
            <Segmented label="Tipo de estrutura" value={opts.kind} options={CORE_KINDS} onChange={setKind} full />
            <Slider label="Tamanho da célula" min={4} max={30} step={0.5} value={opts.cell} display={(v) => `${fmt(v)} mm`} onChange={setOpt("cell")} hint="Célula maior = estrutura mais aberta e mais leve." />
            <Slider label="Espessura da parede da estrutura" min={0.6} max={5} step={0.1} value={opts.strut} display={(v) => `${fmt(v)} mm`} onChange={setOpt("strut")} hint="Use um múltiplo do bico (0,4 mm) para o fatiador imprimir limpo." />
            <Slider label="Casca externa maciça" min={minWall} max={8} step={0.2} value={Math.max(opts.wall, minWall)} display={(v) => `${fmt(v)} mm`} onChange={setOpt("wall")} hint={mode === "block" ? "0 = a estrutura vai até a borda." : "A casca é o que se vê e o que segura o parafuso."} />
            {opts.kind === "voronoi" && <NumField label="Sorteio das células (semente)" value={opts.seed} onChange={setOpt("seed")} min={1} max={999} step={1} unit="" hint="Outro número, outro desenho." />}
            <Toggle label="Ver por dentro (corte ao meio, só na prévia)" checked={inside} onChange={(v) => tool.set((s) => ({ ...s, inside: v }), "inside")} />
          </div>
          {stats && !busy && (
            <div className="card stack">
              <h3>Resultado</h3>
              <Alert kind="ok">
                {mode === "part" ? "Peça" : "Bloco"} de {fmt(massGrams(stats.volume))} g em PLA, contra {fmt(massGrams(stats.solidVolume))} g maciça: economia de {Math.round((1 - stats.volume / stats.solidVolume) * 100)}%.
              </Alert>
              <span className="hint">
                Menor seção de material (X · Y · Z), comparada à maciça: {Math.round(stats.sections.x * 100)}% · {Math.round(stats.sections.y * 100)}% · {Math.round(stats.sections.z * 100)}%. Só compara as opções; não é uma simulação de carga.
              </span>
              {stats.coarse && <Alert kind="warn">A célula é grande para o tamanho da peça: a estrutura sai mais facetada. Use uma célula maior.</Alert>}
            </div>
          )}
          <div className="card stack">
            <h3>Comparar as 3 estruturas</h3>
            <button type="button" className="btn" onClick={() => void compare()} disabled={!source || !valid || !!comparing}>
              {comparing ?? "Comparar giroide, voronoi e treliça"}
            </button>
            {compared && (compared.key === compareKey ? <LightenCompare rows={compared.rows} current={opts.kind} onPick={setKind} /> : <span className="hint">Mudou alguma medida: compare de novo.</span>)}
          </div>
          <ExportButtons models={models} name={`${baseName}-miolo-leve`} busy={busy} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Preview3D
            models={shown}
            quietBusy
            busy={busy}
            busyText="Calculando o miolo…"
            error={error}
            emptyText={!valid ? "Corrija os campos em vermelho." : mode === "part" ? "Envie um STL ou 3MF para alivianar." : "Defina as medidas do bloco."}
            views
          />
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
