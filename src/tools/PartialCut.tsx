import { useMemo, useState } from "react";
import { meshBounds, type Bounds } from "../geometry/bounds";
import { splitIslands } from "../geometry/islands";
import { getManifold } from "../geometry/manifold";
import { readOwnFile } from "../geometry/ownModel";
import { DEFAULT_PARTIAL_CUT, partialCut, planeNormal, type Box, type CutReport, type PartialCutOptions, type Vec3 } from "../geometry/partialCut";
import type { CutAxis, PinMode, PinShape } from "../geometry/planeCut";
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
import { restoreBytes, storeBytes } from "./storedFile";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

type Pick = "center" | "island" | "plane";

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
  ["fixed", "Pino fixo no resto"],
];
const PICKS: [Pick, string][] = [
  ["center", "Centrar a caixa"],
  ["island", "Caixa na parte clicada"],
  ["plane", "Plano neste ponto"],
];
const MAX_BYTES = 200 * 1024 * 1024;
const STEP = 0.5;
const PAD = 1; // folga da caixa em volta da parte clicada
const MAX_TILT = 60;
const MAX_EXPLODE = 60;
const mm = (n: number) => n.toFixed(1).replace(".", ",") + " mm";

const initialState = () => ({ file: null as { name: string; bytes: Uint8Array } | null, opts: DEFAULT_PARTIAL_CUT as PartialCutOptions, limit: true, pick: "center" as Pick });
type CutState = ReturnType<typeof initialState>;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Alcance do plano ao longo da normal: do canto mais baixo ao mais alto da peça. */
function planeRange(b: Bounds, n: Vec3): [number, number] {
  const d = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => dot(n, [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]));
  return [Math.floor(Math.min(...d)), Math.ceil(Math.max(...d))];
}

/** Caixa em volta da parte solta mais perto do ponto (ou da que o contém). */
function islandBox(model: Model, p: Vec3): Box | null {
  const boxes = model.parts.flatMap((part) => splitIslands(part.mesh).map((m) => meshBounds([m])!));
  const dist = (b: Bounds) => Math.hypot(...[0, 1, 2].map((a) => Math.max(b.min[a] - p[a], 0, p[a] - b.max[a])));
  const best = boxes.sort((a, b) => dist(a) - dist(b))[0];
  return best ? { min: best.min.map((v) => v - PAD) as Vec3, max: best.max.map((v) => v + PAD) as Vec3 } : null;
}

/**
 * Corte parcial: o plano de corte só vale dentro de uma caixa que a pessoa limita, então o resto do arquivo
 * (a árvore ao lado do personagem) não é cortado. Pino ou furo na face cortada; o pedaço sai deitado nela.
 */
export default function PartialCut() {
  const tool = useToolState("partialcut", initialState, {
    label: "Corte parcial",
    save: (s) => ({ ...s, file: s.file && { name: s.file.name, bytes: storeBytes(s.file.bytes) } }),
    load: (raw) => {
      const r = raw as Omit<CutState, "file"> & { file: { name: string; bytes: string | null } | null };
      const bytes = restoreBytes(r.file?.bytes);
      return { ...initialState(), ...r, file: r.file && bytes ? { name: r.file.name, bytes } : null };
    },
  });
  const { file, opts, limit, pick } = tool.state;
  const [setLimit, setPick] = [tool.field("limit"), tool.field("pick")];
  const setO = <K extends keyof PartialCutOptions>(key: K) => (v: PartialCutOptions[K]) => tool.set((s) => ({ ...s, opts: { ...s.opts, [key]: v } }), key);
  const [fileError, setFileError] = useState<string | null>(null);

  const parsed = useMemo<{ model: Model; bounds: Bounds } | { error: string } | null>(() => {
    if (!file) return null;
    try {
      const model = readOwnFile(file.bytes, file.name);
      return { model, bounds: meshBounds(model.parts.map((p) => p.mesh))! };
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [file]);
  const model = parsed && "model" in parsed ? parsed.model : null;
  const bounds = parsed && "bounds" in parsed ? parsed.bounds : null;
  const baseName = file?.name.replace(/\.[^.]+$/, "") ?? "modelo";

  const normal = planeNormal(opts.axis, opts.tilt);
  const [lo, hi] = bounds ? planeRange(bounds, normal) : [0, 1];
  const offset = clamp(opts.offset, lo, hi);
  const box: Box | null = limit ? opts.box : null;

  async function onFile(f: File) {
    setFileError(null);
    if (!/\.(stl|3mf)$/i.test(f.name)) return setFileError("Envie um arquivo .stl ou .3mf.");
    if (f.size > MAX_BYTES) return setFileError("Arquivo maior que 200 MB.");
    const bytes = new Uint8Array(await f.arrayBuffer());
    try {
      const b = meshBounds(readOwnFile(bytes, f.name).parts.map((p) => p.mesh))!;
      const [l, h] = planeRange(b, planeNormal("z", 0));
      tool.set((cur) => ({ ...cur, file: { name: f.name, bytes }, opts: { ...cur.opts, axis: "z", tilt: 0, offset: (l + h) / 2, box: { min: b.min, max: b.max } } }), "file");
    } catch (e) {
      setFileError(errorText(e));
    }
  }

  function onPick(hit: { point: [number, number, number] }) {
    if (!model || !opts.box) return;
    const p = hit.point;
    if (pick === "plane") return setO("offset")(dot(normal, p));
    if (pick === "island") return limit && setO("box")(islandBox(model, p));
    const size = [0, 1, 2].map((a) => opts.box!.max[a] - opts.box!.min[a]);
    setO("box")({ min: p.map((v, a) => v - size[a] / 2) as Vec3, max: p.map((v, a) => v + size[a] / 2) as Vec3 });
  }

  const setEdge = (side: "min" | "max", a: number) => (v: number) => {
    const cur = opts.box!;
    setO("box")(side === "min" ? { ...cur, min: cur.min.map((x, i) => (i === a ? Math.min(v, cur.max[a] - STEP) : x)) as Vec3 } : { ...cur, max: cur.max.map((x, i) => (i === a ? Math.max(v, cur.min[a] + STEP) : x)) as Vec3 });
  };

  const valid = inRange(opts.clearance, 0, 1) && (opts.size === 0 || inRange(opts.size, 2, 30));
  const { models, warnings, busy, error, view } = useModelBuilder<{ preview: Model[]; report: CutReport }>(async () => {
    if (!model || !valid) return null;
    const out = partialCut(await getManifold(), model, { ...opts, offset, box });
    return { models: out.models, warnings: out.warnings, view: { preview: out.preview, report: out.report } };
  }, [model, opts, offset, box, valid]);

  const axisName = ["X", "Y", "Z"];
  return (
    <div className="page">
      <h1>Corte parcial</h1>
      <p className="lead">Corta só um pedaço do modelo, dentro de uma caixa.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Arquivo</h3>
            <Dropzone accept=".stl,.3mf" label={file ? file.name : "Arraste o .stl ou .3mf"} hint="Um sólido fechado (sem furos na malha)." onFile={onFile} />
            {fileError && <Alert kind="error">{fileError}</Alert>}
            {parsed && "error" in parsed && <Alert kind="error">{parsed.error}</Alert>}
            <Alert kind="warn">Use só modelos que são seus ou cuja licença permite alterar e imprimir. O app não confere a licença do arquivo.</Alert>
          </div>
          {model && bounds && (
            <>
              <div className="card stack">
                <h3>Plano de corte</h3>
                <div>
                  <span className="field-label">Direção</span>
                  <Segmented label="Direção do plano" value={opts.axis} options={AXES} onChange={setO("axis")} full />
                </div>
                <Slider label="Posição do plano" min={lo} max={hi} step={STEP} value={offset} display={mm} onChange={setO("offset")} />
                <Slider label="Inclinação" min={-MAX_TILT} max={MAX_TILT} value={opts.tilt} display={(v) => `${v}°`} onChange={setO("tilt")} />
              </div>
              <div className="card stack">
                <h3>Região do corte</h3>
                <Toggle label="Cortar só dentro da caixa (fora dela nada é cortado)" checked={limit} onChange={setLimit} />
                {limit && opts.box && (
                  <>
                    <div className="grid two">
                      {[0, 1, 2].flatMap((a) => [
                        <Slider key={`${a}min`} label={`${axisName[a]} de`} min={Math.floor(bounds.min[a]) - PAD} max={Math.ceil(bounds.max[a]) + PAD} step={STEP} value={opts.box!.min[a]} display={mm} onChange={setEdge("min", a)} />,
                        <Slider key={`${a}max`} label={`${axisName[a]} até`} min={Math.floor(bounds.min[a]) - PAD} max={Math.ceil(bounds.max[a]) + PAD} step={STEP} value={opts.box!.max[a]} display={mm} onChange={setEdge("max", a)} />,
                      ])}
                    </div>
                    <div>
                      <span className="field-label">Ao clicar na prévia</span>
                      <Segmented label="Ao clicar na prévia" value={pick} options={PICKS} onChange={setPick} full />
                    </div>
                    <span className="hint">A caixa azul mostra até onde o corte vale e o ladrilho vermelho é o plano. O pedaço aparece em laranja.</span>
                  </>
                )}
              </div>
              <div className="card stack">
                <h3>Encaixe na face cortada</h3>
                <Segmented label="Encaixe" value={opts.pin} options={PINS} onChange={setO("pin")} full />
                {opts.pin !== "none" && (
                  <>
                    <Segmented label="Tipo de pino" value={opts.mode} options={PIN_MODES} onChange={setO("mode")} full />
                    <div className="grid two">
                      <NumField label="Tamanho do pino" value={opts.size} onChange={setO("size")} min={0} max={30} step={0.5} hint="0 = automático" />
                      <NumField label="Folga do encaixe" value={opts.clearance} onChange={setO("clearance")} min={0} max={1} step={0.05} hint="0,2 costuma entrar justo." />
                    </div>
                  </>
                )}
              </div>
              <div className="card stack">
                <h3>Prévia</h3>
                <Slider label="Afastar o pedaço" min={0} max={MAX_EXPLODE} value={opts.explode} display={mm} onChange={setO("explode")} hint="Só na prévia: não muda os arquivos." />
              </div>
              {view?.report && !busy && (view.report.ok ? <Alert kind="ok">Conferido: as duas peças saem fechadas e, juntas, têm o mesmo volume do original.</Alert> : <Alert kind="warn">As peças não somam o volume do original (ou a malha não fecha). Confira o arquivo.</Alert>)}
            </>
          )}
          <ExportButtons models={models} name={`${baseName}-corte`} busy={busy} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Preview3D
            models={view?.preview ?? []}
            busy={busy}
            busyText="Cortando…"
            error={error}
            emptyText={!valid ? "Corrija os campos em vermelho." : "Envie um STL ou 3MF para cortar."}
            onPick={model && opts.box ? onPick : undefined}
          />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
