import { Cookie, Download, Layers, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Go } from "../pages";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import { saveFile, slug } from "../ui/saveFile";
import Slider from "../ui/Slider";
import { errorText, useToast } from "../ui/Toast";
import { IMAGE_ACCEPT, loadRaster, trace, TraceCancelled, type Raster, type TraceJob, type TraceProgress } from "../vectorize/client";
import { DEFAULT_TRACE, type TraceOptions } from "../vectorize/pipeline";
import { scaleFactor } from "../vectorize/raster";
import { buildSvg } from "../vectorize/svgOut";
import type { TraceDone } from "../vectorize/vectorize.worker";
import { handoffSvg } from "./handoff";

const MANY_PATHS = 2000;
const MOSTLY_FILLED = 96;
const CLEANUP_LABELS = ["Nenhuma", "Leve", "Média", "Forte"];

/** Sobreposição vermelha dos pixels com traço fino. */
function thinOverlay(thin: Uint8Array, w: number, h: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < thin.length; i++) if (thin[i]) img.data.set([220, 38, 38, 255], i * 4);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

const progressText = (p: TraceProgress | null) =>
  !p ? "Preparando…" : p.stage === "prepare" ? "Limpando a imagem…" : p.ticks ? `Vetorizando… ${p.ticks} contornos` : "Vetorizando…";

export default function ImageToSvg({ go }: { go: Go }) {
  const [file, setFile] = useState<File | null>(null);
  const [raster, setRaster] = useState<Raster | null>(null);
  const [opts, setOpts] = useState<TraceOptions>(DEFAULT_TRACE);
  const [applied, setApplied] = useState<TraceOptions | null>(null);
  const [result, setResult] = useState<TraceDone | null>(null);
  const [progress, setProgress] = useState<TraceProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const job = useRef<TraceJob | null>(null);
  const toast = useToast();
  const set = <K extends keyof TraceOptions>(k: K, v: TraceOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  useEffect(() => () => job.current?.cancel(), []);

  async function onFile(f: File) {
    job.current?.cancel();
    setError(null);
    setResult(null);
    setApplied(null);
    try {
      const r = await loadRaster(f, scaleFactor);
      setFile(f);
      setRaster((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return r;
      });
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function apply() {
    if (!raster) return;
    const o = { ...opts, widthMm: opts.widthMm > 0 ? opts.widthMm : DEFAULT_TRACE.widthMm };
    job.current?.cancel();
    const j = trace(raster, o, null, setProgress);
    job.current = j;
    setRunning(true);
    setProgress(null);
    setError(null);
    try {
      const r = await j.result;
      setResult(r);
      setApplied(o);
    } catch (e) {
      if (!(e instanceof TraceCancelled)) setError(errorText(e));
    } finally {
      if (job.current === j) {
        job.current = null;
        setRunning(false);
      }
    }
  }

  const dirty = !!applied && JSON.stringify(applied) !== JSON.stringify(opts);
  const svg = useMemo(() => (result && raster && applied ? buildSvg(result.d, raster.w, raster.h, applied.widthMm) : null), [result, raster, applied]);
  const svgUrl = useMemo(() => (svg ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })) : null), [svg]);
  useEffect(() => () => void (svgUrl && URL.revokeObjectURL(svgUrl)), [svgUrl]);
  const overlay = useMemo(() => (result?.thin && result.thinCount > 0 && raster ? thinOverlay(result.thin, raster.w, raster.h) : null), [result, raster]);

  const name = file ? slug(file.name.replace(/\.[^.]+$/, "")) : "desenho";
  const paths = result ? (result.d.match(/M/g) ?? []).length : 0;

  async function onSave() {
    if (!svg) return;
    try {
      const p = await saveFile(`${name}.svg`, svg, "svg", "SVG");
      if (p) toast(`SVG salvo em ${p}`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  function sendTo(page: string) {
    if (!svg) return;
    handoffSvg(svg, name);
    go(page);
  }

  return (
    <div className="page">
      <h1>Imagem → SVG</h1>
      <p className="lead">Transforma logo, desenho ou silhueta em um SVG de 1 cor, liso e já no tamanho de impressão.</p>
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <Dropzone accept={IMAGE_ACCEPT} label={file ? file.name : "Arraste uma imagem ou clique"} hint="PNG, JPG, WebP, BMP, GIF ou AVIF · até 25 MB" onFile={onFile} />
          </div>
          <div className="card stack">
            <h3>Ajustes</h3>
            <label className="check">
              <input type="checkbox" checked={opts.threshold === null} onChange={(e) => set("threshold", e.target.checked ? null : (result?.threshold ?? 160))} /> Limiar automático
            </label>
            <Slider
              label="Limiar (claro ↔ escuro)"
              min={20}
              max={245}
              value={opts.threshold ?? result?.threshold ?? 160}
              disabled={opts.threshold === null}
              onChange={(v) => set("threshold", v)}
              hint="Mais alto = tons mais claros também viram forma."
            />
            <Slider
              label="Limpeza"
              min={0}
              max={3}
              value={opts.cleanup}
              display={(v) => CLEANUP_LABELS[v]}
              onChange={(v) => set("cleanup", v)}
              hint="Suaviza ruído e fecha furinhos antes de vetorizar."
            />
            <Slider label="Detalhe" min={1} max={10} value={opts.detail} onChange={(v) => set("detail", v)} hint="Menos detalhe = curvas mais simples e arquivo menor." />
            <label>
              Ignorar pedaços menores que (mm²)
              <input type="number" min={0} max={100} step={0.5} value={opts.minAreaMm2} onChange={(e) => set("minAreaMm2", Math.max(0, e.target.valueAsNumber || 0))} />
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.removeBg} onChange={(e) => set("removeBg", e.target.checked)} /> Remover fundo automaticamente
            </label>
            <label className="check">
              <input type="checkbox" checked={opts.invert} onChange={(e) => set("invert", e.target.checked)} /> O desenho é claro sobre fundo escuro
            </label>
            <label>
              Largura final (mm)
              <input type="number" min={1} max={1000} value={opts.widthMm} onChange={(e) => set("widthMm", e.target.valueAsNumber)} />
              <span className="hint">A altura acompanha a proporção{raster ? `: ${((opts.widthMm * raster.h) / raster.w).toFixed(1)} mm` : ""}.</span>
            </label>
          </div>
          <div className="card stack">
            <button className="action" disabled={!svg} onClick={onSave}>
              <Download aria-hidden /> Salvar SVG
            </button>
            <div className="grid two">
              <button disabled={!svg} onClick={() => sendTo("cutter")}>
                <Cookie aria-hidden /> Fazer cortador
              </button>
              <button disabled={!svg} onClick={() => sendTo("extrude")}>
                <Layers aria-hidden /> Extrudar em 3D
              </button>
            </div>
          </div>
        </div>

        <div className="preview-col">
          <div className="apply-bar" aria-live="polite">
            {running ? (
              <>
                <span className="spinner" />
                <span>{progressText(progress)}</span>
                <button onClick={() => job.current?.cancel()}>
                  <X aria-hidden /> Cancelar
                </button>
              </>
            ) : (
              <>
                <button className="primary" disabled={!raster} onClick={apply}>
                  <Play aria-hidden /> {result ? "Aplicar alterações" : "Aplicar"}
                </button>
                <span className={dirty ? "dirty" : "muted"}>
                  {!raster ? "Envie uma imagem para começar." : dirty ? "Há alterações não aplicadas." : result ? "Resultado atualizado." : "Ajuste à esquerda e clique em Aplicar."}
                </span>
              </>
            )}
          </div>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="pair">
            <figure>
              <figcaption>Original</figcaption>
              <div className="img checker">{raster ? <img src={raster.url} alt="Imagem original" /> : <span className="muted">Nenhuma imagem</span>}</div>
            </figure>
            <figure>
              <figcaption>
                <span>SVG vetorizado</span>
                {dirty && <span className="dirty">desatualizado</span>}
              </figcaption>
              <div className="img" style={{ background: "#fff", opacity: running ? 0.5 : 1 }}>
                {svgUrl ? (
                  <>
                    <img className="fit" src={svgUrl} alt="Resultado vetorizado" />
                    {overlay && <img className="fit" src={overlay} alt="" />}
                  </>
                ) : (
                  <span className="muted">{running ? progressText(progress) : raster ? "Ajuste e clique em Aplicar" : "O resultado aparece aqui"}</span>
                )}
              </div>
            </figure>
          </div>
          {result && (
            <div className="metrics" aria-live="polite">
              <span>Caminhos <b>{paths}</b></span>
              <span>Área preenchida <b>{result.fillPct.toFixed(0)}%</b></span>
              <span>Arquivo <b>{((svg?.length ?? 0) / 1024).toFixed(1)} KB</b></span>
              <span>Tempo <b>{result.ms.toFixed(0)} ms</b></span>
            </div>
          )}
          {result && result.thinCount > 0 && (
            <Alert kind="warn">Trechos em vermelho ficam com menos de 0,4 mm nesta largura e podem não imprimir com bico 0,4. Aumente a largura ou o limiar.</Alert>
          )}
          {result && paths === 0 && <Alert kind="warn">Nenhuma forma encontrada. Ajuste o limiar ou marque “claro sobre fundo escuro”.</Alert>}
          {result && result.fillPct > MOSTLY_FILLED && <Alert kind="warn">Quase tudo ficou preenchido. Confira o limiar e a inversão.</Alert>}
          {paths > MANY_PATHS && <Alert kind="warn">Mais de {MANY_PATHS} caminhos: aumente a Limpeza ou diminua o Detalhe.</Alert>}
        </div>
      </div>
    </div>
  );
}
