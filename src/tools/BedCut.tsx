import { useEffect, useMemo, useState } from "react";
import { bed as printerBed } from "../geometry/bed";
import { DEFAULT_BEDCUT, type BedCutInfo, type BedCutOptions } from "../geometry/bedCut";
import { bedCutAsync, openBedCutAsync } from "../geometry/bedCutClient";
import { MAX_PARTS_PER_AXIS, planCuts, type Vec3 } from "../geometry/bedCutPlan";
import { fileKey } from "../geometry/jobs";
import { meshBounds } from "../geometry/bounds";
import type { JointKind } from "../geometry/bedCutJoints";
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
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";

const MAX_BYTES = 200 * 1024 * 1024;
const JOINTS: [JointKind, string][] = [
  ["round", "Pino redondo"],
  ["square", "Pino quadrado"],
  ["dovetail", "Rabo de andorinha"],
  ["magnet", "Ímã"],
  ["none", "Sem encaixe"],
];
const JOINT_HELP: Record<JointKind, string> = {
  round: "Um furo em cada parte e um pino solto, impresso à parte. O mais fácil de acertar e de colar.",
  square: "Como o pino redondo, mas quadrado: não deixa a parte girar.",
  dovetail: "Uma ranhura de ponta a ponta nas duas partes e uma chave em forma de ampulheta que entra deslizando pela lateral: trava sem cola.",
  magnet: "Só os furos para um ímã de cada lado (polos invertidos): monta e desmonta sem cola.",
  none: "Só o corte. Use quando for colar de topo ou o encaixe vai ser feito de outro jeito.",
};
type Preset = { label: string; bed: { x: number; y: number; z: number } };
const BED_PRESETS: Preset[] = [
  { label: "Bambu A1, P1 (256)", bed: { x: 256, y: 256, z: 256 } },
  { label: "Ender 3 (220)", bed: { x: 220, y: 220, z: 250 } },
  { label: "Mesa pequena (180)", bed: { x: 180, y: 180, z: 180 } },
  { label: "Mesa grande (350)", bed: { x: 350, y: 350, z: 350 } },
];

const initialState = () => ({
  file: null as { name: string; bytes: Uint8Array } | null,
  /** Mesa digitada à mão; null = a da impressora escolhida nas Preferências. */
  bed: null as { x: number; y: number; z: number } | null,
  margin: DEFAULT_BEDCUT.margin,
  auto: true,
  counts: [2, 1, 1] as Vec3,
  joint: "round" as JointKind,
  size: 0,
  clearance: DEFAULT_BEDCUT.clearance,
  magnetD: DEFAULT_BEDCUT.magnet.d,
  magnetH: DEFAULT_BEDCUT.magnet.h,
  numbers: true,
  view: "bed" as "bed" | "assembled",
  explode: 0,
});
type BedCutState = ReturnType<typeof initialState>;

const mm = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Cortar peça grande para a mesa (#218): STL ou 3MF maior que a mesa vira pedaços iguais com encaixe (pino, rabo de
 * andorinha ou ímã) e o número de cada junta gravado nas duas faces, arrumados em mesas e prontos para imprimir.
 */
export default function BedCut() {
  const tool = useToolState("bedcut", initialState, {
    label: "Cortar para a mesa",
    save: (s) => ({ ...s, file: s.file && { name: s.file.name, bytes: storeBytes(s.file.bytes) } }),
    load: (raw) => {
      const r = raw as Omit<BedCutState, "file"> & { file: { name: string; bytes: string | null } | null };
      const bytes = restoreBytes(r.file?.bytes);
      return { ...initialState(), ...r, file: r.file && bytes ? { name: r.file.name, bytes } : null };
    },
  });
  const s = tool.state;
  const set = <K extends keyof BedCutState>(key: K) => tool.field(key) as (v: BedCutState[K] | ((cur: BedCutState[K]) => BedCutState[K])) => void;
  const [fileError, setFileError] = useState<string | null>(null);
  const [info, setInfo] = useState<BedCutInfo | null>(null);
  const printer = printerBed();
  const bed = s.bed ?? { x: printer.x, y: printer.y, z: printer.z };

  const key = useMemo(() => (s.file ? fileKey(s.file.name, s.file.bytes) : ""), [s.file]);
  const [opened, setOpened] = useState<{ key: string; dims: Vec3 } | { key: string; error: string } | null>(null);
  useEffect(() => {
    if (!s.file) return;
    let alive = true;
    openBedCutAsync(key, s.file.bytes, s.file.name).then(
      (dims) => alive && setOpened({ key, dims }),
      (e) => alive && setOpened({ key, error: errorText(e) }),
    );
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = opened?.key === key && s.file ? opened : null;
  const dims = current && "dims" in current ? current.dims : null;
  const openError = current && "error" in current ? current.error : null;
  const suggested = useMemo(() => (dims ? planCuts(dims, bed, s.margin) : null), [dims, bed.x, bed.y, bed.z, s.margin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onFile(f: File) {
    setFileError(null);
    if (!/\.(stl|3mf)$/i.test(f.name)) return setFileError("Envie um arquivo .stl ou .3mf.");
    if (f.size > MAX_BYTES) return setFileError("Arquivo maior que 200 MB.");
    const bytes = new Uint8Array(await f.arrayBuffer());
    tool.set((cur) => ({ ...cur, file: { name: f.name, bytes } }), "file");
  }

  const valid = [bed.x, bed.y].every((v) => inRange(v, 50, 1000)) && inRange(bed.z, 50, 1000) && inRange(s.margin, 0, 30) && inRange(s.clearance, 0, 1) && (s.size === 0 || inRange(s.size, 3, 30)) && s.counts.every((n) => inRange(n, 1, MAX_PARTS_PER_AXIS));
  const inputs = [dims, valid, bed.x, bed.y, bed.z, s.margin, s.auto, s.counts, s.joint, s.size, s.clearance, s.magnetD, s.magnetH, s.numbers, s.explode];
  const ctl = useJobControl(inputs);
  const { models: all, warnings, busy, error } = useModelBuilder(async () => {
    if (!s.file || !dims || !valid) return null;
    const o: BedCutOptions = {
      bed,
      margin: s.margin,
      counts: s.auto ? null : s.counts,
      joint: s.joint,
      size: s.size,
      clearance: s.clearance,
      magnet: { d: s.magnetD, h: s.magnetH },
      numbers: s.numbers,
      explode: s.explode,
    };
    const out = await ctl.run((onProgress) => bedCutAsync(key, s.file!.bytes, s.file!.name, o, onProgress));
    setInfo(out.info);
    return { models: [...out.models, ...out.assembled], warnings: out.warnings };
  }, [...inputs, ctl.rev]);
  const shown = useMemo(() => all.filter((m) => (s.view === "assembled" ? m.previewOnly : !m.previewOnly)), [all, s.view]);
  const printable = useMemo(() => all.filter((m) => !m.previewOnly), [all]);
  const baseName = s.file?.name.replace(/\.[^.]+$/, "") ?? "peca";
  const fitsAlready = dims && suggested && suggested.pieces === 1;

  return (
    <div className="page">
      <h1>Dividir peça grande</h1>
      <p className="lead">Divide o STL grande em pedaços com encaixe.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Arquivo</h3>
            <Dropzone accept=".stl,.3mf" label={s.file ? s.file.name : "Arraste o .stl ou .3mf grande"} hint="Um sólido fechado; furos pequenos na malha o app conserta." onFile={onFile} />
            {fileError && <Alert kind="error">{fileError}</Alert>}
            {openError && <Alert kind="error">{openError}</Alert>}
            {dims && <span className="hint">Peça: {mm(dims[0])} × {mm(dims[1])} × {mm(dims[2])} mm</span>}
            <p className="hint">Quando usar: o STL é maior que a mesa da impressora. O app corta em pedaços iguais, faz o encaixe entre eles e numera cada junta nas duas faces para montar sem erro.</p>
          </div>
          <div className="card stack">
            <h3>Mesa</h3>
            <div className="chips" role="group" aria-label="Mesas prontas">
              {BED_PRESETS.map((p) => (
                <button key={p.label} type="button" className="sm" onClick={() => set("bed")(p.bed)}>
                  {p.label}
                </button>
              ))}
              <button type="button" className="sm" aria-pressed={!s.bed} onClick={() => set("bed")(null)}>
                {printer.name ? `Da impressora (${printer.name})` : "Da impressora"}
              </button>
            </div>
            <div className="grid two">
              <NumField label="Mesa X" value={bed.x} onChange={(x) => set("bed")({ ...bed, x })} min={50} max={1000} step={1} />
              <NumField label="Mesa Y" value={bed.y} onChange={(y) => set("bed")({ ...bed, y })} min={50} max={1000} step={1} />
              <NumField label="Altura" value={bed.z} onChange={(z) => set("bed")({ ...bed, z })} min={50} max={1000} step={1} />
              <NumField label="Folga da borda" value={s.margin} onChange={set("margin")} min={0} max={30} step={1} hint="Cada pedaço fica a esta distância da borda da mesa." />
            </div>
          </div>
          <div className="card stack">
            <h3>Cortes</h3>
            {suggested && (
              <p className="hint">
                {fitsAlready
                  ? "A peça já cabe na mesa: não precisa cortar."
                  : suggested.fits
                    ? `Para caber, o app sugere ${suggested.counts[0]} × ${suggested.counts[1]} × ${suggested.counts[2]} partes (${suggested.pieces} pedaços).`
                    : "Nem com 8 partes por eixo cabe nesta mesa."}
              </p>
            )}
            <Toggle label="O app escolhe quantas partes (menos pedaços possível)" checked={s.auto} onChange={set("auto")} />
            {!s.auto && (
              <div className="grid two">
                {(["X", "Y", "Z"] as const).map((a, i) => (
                  <NumField key={a} label={`Partes em ${a}`} unit="partes" value={s.counts[i]} onChange={(n) => set("counts")(s.counts.map((v, j) => (j === i ? n : v)) as Vec3)} min={1} max={MAX_PARTS_PER_AXIS} step={1} />
                ))}
              </div>
            )}
          </div>
          <div className="card stack">
            <h3>Encaixe</h3>
            <Segmented label="Encaixe" value={s.joint} options={JOINTS} onChange={set("joint")} full />
            <span className="hint">{JOINT_HELP[s.joint]}</span>
            {s.joint === "magnet" ? (
              <div className="grid two">
                <NumField label="Diâmetro do ímã" value={s.magnetD} onChange={set("magnetD")} min={3} max={20} step={0.5} />
                <NumField label="Espessura do ímã" value={s.magnetH} onChange={set("magnetH")} min={1} max={10} step={0.5} />
              </div>
            ) : (
              s.joint !== "none" && (
                <div className="grid two">
                  <NumField label={s.joint === "dovetail" ? "Cintura da chave" : "Tamanho do pino"} value={s.size} onChange={set("size")} min={0} max={30} step={0.5} hint="0 = automático" />
                  <NumField label="Folga do encaixe" value={s.clearance} onChange={set("clearance")} min={0} max={1} step={0.05} hint="0,2 costuma entrar justo." />
                </div>
              )
            )}
            <Toggle label="Numerar as juntas (gravado nas duas faces)" checked={s.numbers} onChange={set("numbers")} />
          </div>
          {info && dims && (
            <div className="card stack" aria-label="Resultado do corte">
              <h3>Resultado</h3>
              <p>
                <strong>{info.pieces}</strong> {info.pieces === 1 ? "pedaço" : "pedaços"}, {info.joints} {info.joints === 1 ? "junta" : "juntas"}, {info.plates} {info.plates === 1 ? "mesa" : "mesas"} ({info.counts[0]} × {info.counts[1]} × {info.counts[2]} partes{info.auto ? ", escolhido pelo app" : ""}).
              </p>
              <ul className="stack">
                {printable.map((m) => {
                  const b = meshBounds(m.parts.map((p) => p.mesh));
                  return (
                    <li key={m.name}>
                      <strong>{m.name}</strong>
                      {b && <span className="muted"> · {mm(b.max[0] - b.min[0])} × {mm(b.max[1] - b.min[1])} × {mm(b.max[2] - b.min[2])} mm</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <ExportButtons models={printable} name={`${baseName}-cortes`} busy={busy} onSaved={tool.exported} />
        </div>
        <div className="preview-col">
          <Segmented
            label="Vista"
            value={s.view}
            options={[
              ["bed", "Na mesa (o que imprime)"],
              ["assembled", "Montada"],
            ]}
            onChange={set("view")}
          />
          {s.view === "assembled" && <Slider label="Afastar os pedaços" min={0} max={60} value={s.explode} display={(v) => `${v} mm`} onChange={set("explode")} />}
          <WorkProgress control={ctl} busy={busy} error={error} title="Cortando a peça" />
          <Preview3D models={shown} busy={busy} busyText="Cortando…" error={error} emptyText={!valid ? "Corrija os campos em vermelho." : "Envie um STL ou 3MF grande para cortar."} />
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
