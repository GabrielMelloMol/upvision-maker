import { useMemo, useState } from "react";
import { meshBounds } from "../geometry/bounds";
import { getManifold } from "../geometry/manifold";
import { bestPlane, bestSetup, buildMold, DEFAULT_MOLD, mergedMesh, modelSolid, type MoldAxis, type MoldParams, type MoldReport, type MoldSide } from "../geometry/mold";
import { readOwnFile } from "../geometry/ownModel";
import type { Model } from "../geometry/types";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import ExportButtons from "../ui/ExportButtons";
import NumField, { inRange } from "../ui/NumField";
import Preview3D from "../ui/Preview3D";
import Segmented from "../ui/Segmented";
import Slider from "../ui/Slider";
import { errorText } from "../ui/Toast";
import { useModelBuilder } from "../ui/useModelBuilder";
import ColorPick from "./ColorPick";
import { restoreBytes, storeBytes } from "./storedFile";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

type MoldState = { file: { name: string; bytes: Uint8Array } | null; params: MoldParams };

const AXES: [MoldAxis, string][] = [
  ["z", "Horizontal (Z)"],
  ["x", "Vertical (X)"],
  ["y", "Vertical (Y)"],
];
const SIDES: [MoldSide | "none", string][] = [
  ["+y", "Frente"],
  ["-y", "Trás"],
  ["+x", "Direita"],
  ["-x", "Esquerda"],
  ["none", "Sem canal"],
];
const MAX_BYTES = 200 * 1024 * 1024;
const STEP = 0.5;
const SPARE = 1.1; // sobra de material por causa do canal e do funil
const AXIS_INDEX: Record<MoldAxis, number> = { x: 0, y: 1, z: 2 };
const mm = (n: number) => n.toFixed(1).replace(".", ",") + " mm";
const ml = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: n < 10 ? 1 : 0 }) + " mL";

const initialState = (): MoldState => ({ file: null, params: DEFAULT_MOLD });

/**
 * Molde bipartido (#239): envia um STL ou 3MF e sai um molde de duas metades com pinos de alinhamento, canal de
 * vazamento com funil e respiros, para resina, silicone, sabonete, vela, gesso ou chocolate.
 */
export default function Mold() {
  const tool = useToolState("mold", initialState, {
    label: "Molde a partir de STL",
    save: (s) => ({ ...s, file: s.file && { name: s.file.name, bytes: storeBytes(s.file.bytes) } }),
    load: (raw) => {
      const r = raw as { file: { name: string; bytes: string | null } | null; params?: Partial<MoldParams> };
      const bytes = restoreBytes(r.file?.bytes);
      return { file: r.file && bytes ? { name: r.file.name, bytes } : null, params: { ...DEFAULT_MOLD, ...r.params } };
    },
  });
  const { file, params: p } = tool.state;
  const [fileError, setFileError] = useState<string | null>(null);

  const parsed = useMemo<{ model: Model; mesh: ReturnType<typeof mergedMesh> } | { error: string } | null>(() => {
    if (!file) return null;
    try {
      const model = readOwnFile(file.bytes, file.name);
      return { model, mesh: mergedMesh(model) };
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [file]);
  const loaded = parsed && "model" in parsed ? parsed : null;
  const bounds = useMemo(() => (loaded ? meshBounds(loaded.model.parts.map((x) => x.mesh)) : null), [loaded]);
  const baseName = file?.name.replace(/\.[^.]+$/, "") ?? "peça";
  const set = <K extends keyof MoldParams>(k: K) => (v: MoldParams[K]) => tool.set((s) => ({ ...s, params: { ...s.params, [k]: v } }), k);

  async function onFile(f: File) {
    setFileError(null);
    if (!/\.(stl|3mf)$/i.test(f.name)) return setFileError("Envie um arquivo .stl ou .3mf.");
    if (f.size > MAX_BYTES) return setFileError("Arquivo maior que 200 MB.");
    const bytes = new Uint8Array(await f.arrayBuffer());
    try {
      const model = readOwnFile(bytes, f.name);
      const auto = bestSetup(mergedMesh(model)); // já abre no eixo e no plano que menos prendem a peça
      tool.set((cur) => ({ ...cur, file: { name: f.name, bytes }, params: { ...cur.params, axis: auto.axis, offset: auto.offset } }), "file");
    } catch (e) {
      setFileError(errorText(e));
    }
  }

  const a = AXIS_INDEX[p.axis];
  const lo = bounds ? Math.floor(bounds.min[a]) : 0;
  const hi = bounds ? Math.ceil(bounds.max[a]) : 1;
  const offset = Math.min(hi, Math.max(lo, p.offset));
  const params = useMemo(() => ({ ...p, offset }), [p, offset]);
  const valid = inRange(p.wall, 5, 40) && inRange(p.pinR, 1.5, 6) && inRange(p.clearance, 0, 1) && inRange(p.sprueR, 2, 10) && inRange(p.ventR, 0.4, 3) && inRange(p.shrink, 0, 20) && inRange(p.vents, 0, 3);
  const paramKey = JSON.stringify(params);

  const { models, warnings, busy, error, view } = useModelBuilder<{ report: MoldReport }>(async () => {
    if (!loaded || !valid) return null;
    const M = await getManifold();
    const { solid, holes } = modelSolid(M, loaded.model);
    try {
      const out = buildMold(M, solid, loaded.mesh, JSON.parse(paramKey) as MoldParams);
      const fixed = holes > 0 ? [`A malha tinha ${holes} furo(s) pequeno(s) e o app os fechou sozinho. Confira se a cavidade ficou como você espera.`] : [];
      return { models: out.models, warnings: [...fixed, ...out.warnings], view: { report: out.report } };
    } finally {
      solid.delete();
    }
  }, [loaded, paramKey, valid]);

  const report = view?.report;
  const range: [number, number] = [lo, hi];
  const suggest = () => loaded && tool.set((s) => ({ ...s, params: { ...s.params, offset: bestPlane(loaded.mesh, s.params.axis) } }), "suggest");

  return (
    <div className="page">
      <h1>Molde a partir de STL</h1>
      <p className="lead">Sua peça vira um molde de duas metades.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Peça</h3>
            <Dropzone accept=".stl,.3mf" label={file ? file.name : "Arraste o .stl ou .3mf"} hint="Um sólido fechado (sem furos na malha)." onFile={onFile} />
            {fileError && <Alert kind="error">{fileError}</Alert>}
            {parsed && "error" in parsed && <Alert kind="error">{parsed.error}</Alert>}
            <Alert kind="warn">Use só peças que são suas ou cuja licença permite copiar. O app não confere a licença do arquivo.</Alert>
          </div>
          {loaded && bounds && (
            <>
              <div className="card stack">
                <h3>Onde o molde abre</h3>
                <div>
                  <span className="field-label">Direção do plano</span>
                  <Segmented label="Direção do plano" value={p.axis} options={AXES} onChange={(v) => tool.set((s) => ({ ...s, params: { ...s.params, axis: v, offset: bestPlane(loaded.mesh, v) } }), "axis")} full />
                </div>
                <Slider label="Posição do plano" min={range[0]} max={range[1]} step={STEP} value={offset} display={mm} onChange={set("offset")} />
                <button type="button" className="ghost sm" onClick={suggest}>Sugerir o plano que menos prende</button>
                <span className="hint">O plano divide a peça em duas metades. Ele tem que passar pela parte mais larga: o que fica mais largo para dentro do molde prende na hora de tirar.</span>
              </div>
              <div className="card stack">
                <h3>Canal de vazamento e respiros</h3>
                <div>
                  <span className="field-label">Lado do canal</span>
                  <Segmented label="Lado do canal" value={p.sprue} options={SIDES} onChange={set("sprue")} full />
                </div>
                {p.sprue !== "none" && (
                  <div className="grid two">
                    <NumField label="Diâmetro do canal" value={p.sprueR * 2} onChange={(v) => set("sprueR")(v / 2)} min={4} max={20} step={0.5} hint="Por onde o material entra." />
                    <NumField label="Respiros" value={p.vents} onChange={set("vents")} min={0} max={3} step={1} hint="Furinhos para o ar sair." />
                  </div>
                )}
              </div>
              <div className="card stack">
                <h3>Parede e encaixe</h3>
                <div className="grid two">
                  <NumField label="Parede em volta" value={p.wall} onChange={set("wall")} min={5} max={40} step={0.5} hint="Sobe sozinha se não couber o pino." />
                  <NumField label="Encolhimento do material" value={p.shrink} onChange={set("shrink")} min={0} max={20} step={0.5} unit="%" hint="Resina e silicone encolhem um pouco: a cavidade cresce para compensar." />
                  <NumField label="Pino de alinhamento" value={p.pinR * 2} onChange={(v) => set("pinR")(v / 2)} min={3} max={12} step={0.5} hint="Diâmetro, um em cada canto." />
                  <NumField label="Folga do pino" value={p.clearance} onChange={set("clearance")} min={0} max={1} step={0.05} hint="0,3 costuma entrar justo." />
                </div>
              </div>
              <div className="card stack">
                <h3>Cores</h3>
                <div className="grid two">
                  <ColorPick label="Metade de baixo" value={p.colorLow} onChange={set("colorLow")} />
                  <ColorPick label="Metade de cima" value={p.colorHigh} onChange={set("colorHigh")} />
                </div>
              </div>
              {report && !busy && (
                <div className="card stack" aria-live="polite">
                  <h3>Quanto cabe</h3>
                  <p>
                    A cavidade leva <b>{ml(report.volumeMl)}</b> de material; separe uns <b>{ml(report.volumeMl * SPARE)}</b> por causa do canal.
                  </p>
                  <span className="hint">O molde mede {mm(report.size[0])} × {mm(report.size[1])} × {mm(report.size[2])}. Passe desmoldante antes de usar e feche com elásticos ou presilhas.</span>
                </div>
              )}
            </>
          )}
          <ExportButtons models={models} name={`${baseName}-molde`} busy={busy} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Preview3D models={models} quietBusy busy={busy} busyText="Montando o molde…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : "Envie um STL ou 3MF para fazer o molde."} views />
          {warnings.map((w) => (
            <Alert key={w} kind="warn">{w}</Alert>
          ))}
        </div>
      </div>
    </div>
  );
}
