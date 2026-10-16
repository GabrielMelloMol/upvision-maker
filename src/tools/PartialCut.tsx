import { useEffect, useMemo, useState } from "react";
import { meshBounds, type Bounds } from "../geometry/bounds";
import { fileKey, JobCancelled } from "../geometry/jobs";
import { getManifold } from "../geometry/manifold";
import { applyHandle, regionHandles } from "../geometry/cutHandles";
import { centerRegionAt, regionBox as regionBoxOf, regionCenter, regionOfKind, type Region, type RegionKind } from "../geometry/cutRegion";
import { cutAsync, fitAsync, readModelAsync } from "../geometry/cutClient";
import type { PinIssue } from "../geometry/cutSequence";
import { cutOverlay, planeNormal, type CutReport, type Vec3 } from "../geometry/partialCut";
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
import { useJobControl } from "../ui/useJobControl";
import { useModelBuilder } from "../ui/useModelBuilder";
import WorkProgress from "../ui/WorkProgress";
import { restoreBytes, storeBytes } from "./storedFile";
import ColorsCard from "./partialcut/ColorsCard";
import PinIssues from "./partialcut/PinIssues";
import SuggestCard from "./partialcut/SuggestCard";
import CutList from "./partialcut/CutList";
import PiecesCard from "./partialcut/PiecesCard";
import RegionControls from "./partialcut/RegionControls";
import { addedCut, clamp, cutForEngine, dot, freshCut, isFresh, initialState, migrate, planeRange, type CutState, type Pick, type UiCut } from "./partialcut/state";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";
import GeneratorHelp from "./models/guide/GeneratorHelp";
import { TOOL_HELP } from "./models/help/toolHelp";

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
const picksFor = (kind: RegionKind): [Pick, string][] => {
  const what = kind === "box" ? "a caixa" : "a região";
  return [
    ["center", `Centrar ${what}`],
    ["island", kind === "box" ? "Caixa na parte clicada" : "Região na parte clicada"],
    ["plane", "Plano neste ponto"],
  ];
};
const MAX_BYTES = 200 * 1024 * 1024;
const STEP = 0.5;
const MAX_TILT = 60;
const MAX_EXPLODE = 60;
const mm = (n: number) => n.toFixed(1).replace(".", ",") + " mm";

/**
 * Corte parcial: o plano de corte só vale dentro de uma caixa que a pessoa limita, então o resto do arquivo
 * (a árvore ao lado do personagem) não é cortado. Pino ou furo na face cortada; o pedaço sai deitado nela.
 */
export default function PartialCut() {
  const tool = useToolState("partialcut", initialState, {
    label: "Corte parcial",
    save: (s) => ({ ...s, file: s.file && { name: s.file.name, bytes: storeBytes(s.file.bytes) } }),
    load: (raw) => {
      const r = raw as Record<string, unknown> & { file: { name: string; bytes: string | null } | null };
      const bytes = restoreBytes(r.file?.bytes);
      return { ...migrate(r), file: r.file && bytes ? { name: r.file.name, bytes } : null };
    },
  });
  const { file, cuts, pick, restColor } = tool.state;
  const active = Math.min(tool.state.active, cuts.length - 1);
  const opts = cuts[active];
  const limit = opts.limit;
  const setPick = tool.field("pick");
  const patchActive = (cur: CutState, patch: Partial<UiCut>): CutState => ({ ...cur, cuts: cur.cuts.map((c, i) => (i === Math.min(cur.active, cur.cuts.length - 1) ? { ...c, ...patch } : c)) });
  const setO = <K extends keyof UiCut>(key: K) => (v: UiCut[K]) => tool.set((s) => patchActive(s, { [key]: v } as Partial<UiCut>), `${key}:${active}`);
  const setExplode = (v: number) => tool.set((s) => ({ ...s, cuts: s.cuts.map((c) => ({ ...c, explode: v })) }), "explode");
  const [fileError, setFileError] = useState<string | null>(null);
  const [fitting, setFitting] = useState(false);

  const key = useMemo(() => (file ? fileKey(file.name, file.bytes) : ""), [file]);
  const [read, setRead] = useState<{ key: string; model: Model; bounds: Bounds } | { key: string; error: string } | null>(null);
  useEffect(() => {
    if (!file || read?.key === key) return;
    let alive = true;
    readModelAsync(file.bytes, file.name).then(
      (m) => {
        const b = meshBounds(m.parts.map((p) => p.mesh));
        if (alive) setRead(b ? { key, model: m, bounds: b } : { key, error: "O arquivo está vazio." });
      },
      (e) => alive && setRead({ key, error: errorText(e) }),
    );
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = read?.key === key && file ? read : null;
  const model = parsed && "model" in parsed ? parsed.model : null;
  const bounds = parsed && "bounds" in parsed ? parsed.bounds : null;
  const baseName = file?.name.replace(/\.[^.]+$/, "") ?? "modelo";

  const normal = planeNormal(opts.axis, opts.tilt);
  const [lo, hi] = bounds ? planeRange(bounds, normal) : [0, 1];
  const offset = clamp(opts.offset, lo, hi);
  const region: Region | null = limit ? opts.region : null;
  const cutKey = JSON.stringify(cuts);

  async function onFile(f: File) {
    setFileError(null);
    if (!/\.(stl|3mf)$/i.test(f.name)) return setFileError("Envie um arquivo .stl ou .3mf.");
    if (f.size > MAX_BYTES) return setFileError("Arquivo maior que 200 MB.");
    const bytes = new Uint8Array(await f.arrayBuffer());
    try {
      const m = await readModelAsync(bytes, f.name);
      const b = meshBounds(m.parts.map((p) => p.mesh));
      if (!b) return setFileError("O arquivo está vazio.");
      setRead({ key: fileKey(f.name, bytes), model: m, bounds: b });
      tool.set((cur) => ({ ...cur, file: { name: f.name, bytes }, active: 0, cuts: [{ ...freshCut(b), pin: cur.cuts[0].pin, mode: cur.cuts[0].mode, size: cur.cuts[0].size, clearance: cur.cuts[0].clearance }] }), "file");
    } catch (e) {
      setFileError(errorText(e));
    }
  }

  /** Região da forma `kind` envolvendo a parte de cima do plano mais perto de `near` (cabeça, não só o pescoço). */
  async function fitTo(kind: RegionKind, near: Vec3) {
    if (!model || !bounds) return;
    setFitting(true);
    try {
      setO("region")(await fitAsync(model, { axis: opts.axis, tilt: opts.tilt, offset, region: opts.region }, kind, near).promise);
    } catch (e) {
      if (e instanceof JobCancelled) return; // outro clique chegou antes: vale o último
      setO("region")(regionOfKind(kind, opts.region ? regionBoxOf(opts.region) : { min: bounds.min, max: bounds.max })); // sem parte acima do plano: só troca a forma
    } finally {
      setFitting(false);
    }
  }

  function onPick(hit: { point: [number, number, number] }) {
    if (!model || !opts.region) return;
    const p = hit.point;
    if (pick === "plane") return setO("offset")(dot(normal, p));
    if (pick === "island") return limit && void fitTo(opts.region.kind, p);
    setO("region")(centerRegionAt(opts.region, p));
  }

  // plano e contorno da região de cada corte seguem o arrasto ao vivo; o corte em si recalcula depois
  const [overlay, setOverlay] = useState<Model[]>([]);
  useEffect(() => {
    if (!bounds) return;
    let alive = true;
    const list = JSON.parse(cutKey) as UiCut[];
    void getManifold().then((M) => {
      if (!alive) return;
      setOverlay(list.flatMap((c) => cutOverlay(M, { min: bounds.min, max: bounds.max }, cutForEngine(c, bounds))));
    });
    return () => {
      alive = false;
    };
  }, [bounds, cutKey]);

  const valid = cuts.every((c) => inRange(c.clearance, 0, 1) && (c.size === 0 || inRange(c.size, 2, 30)));
  const ctl = useJobControl([model, cutKey, restColor, valid]);
  const { models, warnings, busy, error, view } = useModelBuilder<{ preview: Model[]; report: CutReport; pinIssues: PinIssue[] }>(async () => {
    if (!model || !bounds || !valid) return null;
    const out = await ctl.run((onProgress) => cutAsync(model, { cuts: cuts.map((c) => cutForEngine(c, bounds)), restColor }, onProgress));
    return { models: out.models, warnings: out.warnings, view: { preview: out.preview, report: out.report, pinIssues: out.pinIssues } };
  }, [model, cutKey, restColor, valid, ctl.rev]);

  const shown = useMemo(() => (view?.preview ? [...view.preview.filter((m) => m.name !== "Região" && m.name !== "Plano de corte"), ...overlay] : []), [view, overlay]);

  const gizmo = useMemo(() => {
    if (!bounds || !view?.preview) return undefined; // sem modelo na vista não há alça solta no ar
    const anchor = bounds.min.map((v, i) => (v + bounds.max[i]) / 2) as Vec3;
    const ref = { normal, offset };
    return {
      handles: regionHandles(region, ref, anchor),
      onDrag: (id: string, pos: Vec3) =>
        tool.set((cur) => {
          const c = cur.cuts[Math.min(cur.active, cur.cuts.length - 1)];
          const out = applyHandle(c.limit ? c.region : null, { normal: planeNormal(c.axis, c.tilt), offset: c.offset }, id, pos);
          return patchActive(cur, { offset: out.offset, region: c.limit ? out.region : c.region });
        }, `handle:${id}:${active}`),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, view?.preview, region, offset, opts.axis, opts.tilt, tool.set]);

  return (
    <div className="page">
      <h1>Corte parcial</h1>
      <p className="lead">Corta só um pedaço do modelo, dentro de uma região.</p>
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
              <SuggestCard
                key={`${file?.name}:${file?.bytes.length}`}
                model={model}
                onApply={(s) =>
                  tool.set((c) => {
                    const cut: UiCut = { ...freshCut(bounds), axis: "z", tilt: 0, offset: s.z, region: { kind: "box", ...s.region }, pin: c.cuts[0].pin, mode: c.cuts[0].mode, size: c.cuts[0].size, clearance: c.cuts[0].clearance };
                    const replace = c.cuts.length === 1 && isFresh(c.cuts[0], bounds);
                    return { ...c, cuts: replace ? [cut] : [...c.cuts, cut], active: replace ? 0 : c.cuts.length };
                  }, "suggest")
                }
              />
              <CutList count={cuts.length} active={active} onSelect={(i) => tool.set((c) => ({ ...c, active: i }), "active")} onAdd={() => tool.set((c) => ({ ...c, cuts: [...c.cuts, { ...addedCut(bounds), pin: c.cuts[0].pin, mode: c.cuts[0].mode, clearance: c.cuts[0].clearance }], active: c.cuts.length }), "add")} onRemove={() => tool.set((c) => ({ ...c, cuts: c.cuts.filter((_, i) => i !== active), active: Math.max(0, active - 1) }), "remove")} />
              <div className="card stack">
                <h3>Plano de corte{cuts.length > 1 ? ` · corte ${active + 1}` : ""}</h3>
                <div>
                  <span className="field-label">Direção</span>
                  <Segmented label="Direção do plano" value={opts.axis} options={AXES} onChange={setO("axis")} full />
                </div>
                <Slider label="Posição do plano" min={lo} max={hi} step={STEP} value={offset} display={mm} onChange={setO("offset")} />
                <Slider label="Inclinação" min={-MAX_TILT} max={MAX_TILT} value={opts.tilt} display={(v) => `${v}°`} onChange={setO("tilt")} />
              </div>
              <div className="card stack">
                <h3>Região do corte</h3>
                <Toggle label="Cortar só dentro da região (fora dela nada é cortado)" checked={limit} onChange={setO("limit")} />
                {limit && opts.region && (
                  <>
                    <RegionControls region={opts.region} bounds={bounds} onChange={setO("region")} onKind={(k) => void fitTo(k, regionCenter(opts.region!))} />
                    <div>
                      <span className="field-label">Ao clicar na prévia</span>
                      <Segmented label="Ao clicar na prévia" value={pick} options={picksFor(opts.region?.kind ?? "box")} onChange={setPick} full />
                    </div>
                    <span className="hint">O contorno azul tracejado mostra até onde o corte vale e o ladrilho translúcido é o plano. Cada peça aparece na cor que vai para o arquivo.</span>
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
                {view && !busy && (
                  <PinIssues
                    issues={view.pinIssues}
                    many={cuts.length > 1}
                    onSmallerFixed={(i, size) => tool.set((c) => ({ ...c, cuts: c.cuts.map((x, j) => (j === i ? { ...x, mode: "fixed", size } : x)) }), `pinfix:${i}`)}
                    onGlue={(i) => tool.set((c) => ({ ...c, cuts: c.cuts.map((x, j) => (j === i ? { ...x, pin: "none" } : x)) }), `pinnone:${i}`)}
                  />
                )}
              </div>
              <ColorsCard
                cuts={cuts}
                restColor={restColor}
                onPiece={(i, color) => tool.set((c) => ({ ...c, cuts: c.cuts.map((x, j) => (j === i ? { ...x, color } : x)) }), `color:${i}`)}
                onRest={(color) => tool.set((c) => ({ ...c, restColor: color }), "restColor")}
              />
              <div className="card stack">
                <h3>Prévia</h3>
                <Slider label="Afastar o pedaço" min={0} max={MAX_EXPLODE} value={opts.explode} display={mm} onChange={setExplode} hint="Só na prévia: não muda os arquivos." />
              </div>
              {view?.report && !busy && (view.report.ok ? <Alert kind="ok">Conferido: as duas peças saem fechadas e, juntas, têm o mesmo volume do original.</Alert> : <Alert kind="warn">As peças não somam o volume do original (ou a malha não fecha). Confira o arquivo.</Alert>)}
            </>
          )}
          {!busy && <PiecesCard models={models} />}
          <ExportButtons models={models} name={`${baseName}-corte`} busy={busy} onSaved={tool.exported} tips={TOOL_HELP.partialcut.tips} />
          <GeneratorHelp help={TOOL_HELP.partialcut} />
        </div>
        <div className="preview-col">
          {fitting && <span className="hint" role="status">Ajustando a região à parte clicada…</span>}
          <WorkProgress control={ctl} busy={busy} error={error} title="Cortando" />
          <Preview3D
            models={shown}
            quietBusy
            busy={busy}
            busyText="Cortando…"
            error={error}
            emptyText={!valid ? "Corrija os campos em vermelho." : "Envie um STL ou 3MF para cortar."}
            onPick={model && opts.region ? onPick : undefined}
            gizmo={gizmo}
            views
          />
          {warnings.filter((w) => !w.includes("pequena ou fina demais")).map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
