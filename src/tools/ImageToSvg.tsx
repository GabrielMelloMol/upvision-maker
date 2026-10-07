import { Award, Cookie, Download, KeyRound, Layers, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Go } from "../pages";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import { saveFile, slug } from "../ui/saveFile";
import { errorText, useToast } from "../ui/Toast";
import { IMAGE_ACCEPT, loadRaster, trace, TraceCancelled, type Raster, type TraceJob, type TraceProgress } from "../vectorize/client";
import { DEFAULT_TRACE, type TraceOptions } from "../vectorize/pipeline";
import { classifyImage } from "../vectorize/classify";
import { scaleFactor } from "../vectorize/raster";
import { segmentSubject, type Subject } from "../vectorize/segment";
import { buildColorSvg, buildSvg } from "../vectorize/svgOut";
import type { Filament } from "../domain/entities";
import { filamentColors, loadFilaments } from "./filamentColors";
import { useData } from "../ui/useData";
import type { TraceDone } from "../vectorize/vectorize.worker";
import { exampleFile, useExample } from "../help/helpStore";
import { handoffSvg } from "./handoff";
import { restoreFile, storeFile, type StoredFile } from "./storedFile";
import ToolSessionBar from "./ToolSessionBar";
import { useToolState } from "./useToolState";
import TraceSettings from "./TraceSettings";

const MANY_PATHS = 2000;
const MOSTLY_FILLED = 96;


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

type Progress = TraceProgress | { stage: "segment"; ticks: 0 };

const progressText = (p: Progress | null) =>
  !p
    ? "Preparando…"
    : p.stage === "segment"
      ? "Recortando com a IA local…"
      : p.stage === "prepare"
        ? "Limpando a imagem…"
        : p.ticks
          ? `Vetorizando… ${p.ticks} contornos`
          : "Vetorizando…";

const initialState = () => ({ file: null as File | null, opts: DEFAULT_TRACE as TraceOptions, subject: "person" as Subject, useFilaments: true, recolor: {} as Record<number, string> });
type SvgState = ReturnType<typeof initialState>;

export default function ImageToSvg({ go }: { go: Go }) {
  // estado de trabalho: desfazer, rascunho guardado (a imagem vai junto até 4 MB) e últimos projetos (#85)
  const tool = useToolState("svg", initialState, {
    label: "Imagem → SVG",
    save: async (s) => ({ ...s, file: await storeFile(s.file) }),
    load: async (raw) => {
      const r = raw as Omit<SvgState, "file"> & { file?: StoredFile | null };
      return { ...r, file: await restoreFile(r.file) };
    },
  });
  const { file, opts, subject, useFilaments, recolor } = tool.state;
  const [setFile, setOpts, setSubject, setUseFilaments, setRecolor] = [tool.field("file"), tool.field("opts"), tool.field("subject"), tool.field("useFilaments"), tool.field("recolor")];
  const [loadedRaster, setRaster] = useState<{ file: File; raster: Raster } | null>(null);
  // a imagem carregada é a do arquivo atual (arquivo vindo de rascunho, projeto ou desfazer recarrega abaixo)
  const raster = loadedRaster && loadedRaster.file === file ? loadedRaster.raster : null;
  const [applied, setApplied] = useState<TraceOptions | null>(null);
  const [result, setResult] = useState<TraceDone | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [appliedSubject, setAppliedSubject] = useState<Subject | null>(null);
  const segCache = useRef(new Map<Subject, Uint8Array | null>());
  const cancelled = useRef(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const job = useRef<TraceJob | null>(null);
  const isPhoto = useMemo(() => (raster ? classifyImage(raster.rgba, raster.w, raster.h).isPhoto : false), [raster]);
  const toast = useToast();
  const [filamentRows] = useData(loadFilaments, [] as Filament[]);
  const filColors = useMemo(() => filamentColors(filamentRows), [filamentRows]);
  const set = <K extends keyof TraceOptions>(k: K, v: TraceOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

  useEffect(() => () => job.current?.cancel(), []);
  // ao sair da tela a última imagem ainda tem Blob vivo: revoga (B18)
  const rasterUrl = useRef<string | null>(null);
  useEffect(() => {
    rasterUrl.current = loadedRaster?.raster.url ?? null;
  }, [loadedRaster]);
  useEffect(() => () => {
    if (rasterUrl.current) URL.revokeObjectURL(rasterUrl.current);
  }, []);

  // "Usar exemplo" da ajuda (#84): o logo de exemplo do app
  useExample("svg", () => void exampleFile("logo").then(onFile));

  async function onFile(f: File) {
    job.current?.cancel();
    setError(null);
    setResult(null);
    setApplied(null);
    segCache.current.clear();
    try {
      const r = await loadRaster(f, scaleFactor);
      setRaster((old) => {
        if (old) URL.revokeObjectURL(old.raster.url);
        return { file: f, raster: r };
      });
      setFile(f);
    } catch (e) {
      setError(errorText(e));
    }
  }

  // arquivo que voltou (Continuar, projeto reaberto, desfazer): carrega a imagem de novo; o traço pede Aplicar
  useEffect(() => {
    if (!file || loadedRaster?.file === file) return;
    let alive = true;
    loadRaster(file, scaleFactor)
      .then((r) => {
        if (!alive) return URL.revokeObjectURL(r.url);
        segCache.current.clear();
        setResult(null);
        setApplied(null);
        setRaster((old) => {
          if (old) URL.revokeObjectURL(old.raster.url);
          return { file, raster: r };
        });
      })
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [file, loadedRaster]);

  async function apply(next: TraceOptions = opts) {
    if (!raster) return;
    const o = {
      ...next,
      widthMm: next.widthMm > 0 ? next.widthMm : DEFAULT_TRACE.widthMm,
      palette: next.colors > 1 && useFilaments && filColors.length ? filColors.map((f) => f.hex) : null,
    };
    if (o.widthMm !== next.widthMm) setOpts(o); // campo vazio/inválido volta para a largura usada
    job.current?.cancel();
    cancelled.current = false;
    setRunning(true);
    setError(null);
    try {
      let seg: Uint8Array | null = null;
      if (o.mode === "silhouette") {
        if (!segCache.current.has(subject)) {
          setProgress({ stage: "segment", ticks: 0 });
          segCache.current.set(subject, await segmentSubject(raster.rgba, raster.w, raster.h, subject));
        }
        seg = segCache.current.get(subject) ?? null;
        if (cancelled.current) return;
      }
      setProgress(null);
      const j = trace(raster, o, seg, setProgress);
      job.current = j;
      const r = await j.result;
      setResult(r);
      setRecolor({});
      setApplied(o);
      setAppliedSubject(subject);
    } catch (e) {
      if (!(e instanceof TraceCancelled)) setError(errorText(e));
    } finally {
      job.current = null;
      setRunning(false);
    }
  }

  function cancel() {
    cancelled.current = true;
    job.current?.cancel();
    setRunning(false);
  }

  const silhouette = opts.mode === "silhouette";
  const colorMode = !silhouette && opts.colors > 1;
  const same = (a: TraceOptions, b: TraceOptions) => JSON.stringify({ ...a, palette: null }) === JSON.stringify({ ...b, palette: null });
  const dirty = !!applied && (!same(applied, opts) || (opts.mode === "silhouette" && appliedSubject !== subject) || (colorMode && !!applied.palette !== (useFilaments && filColors.length > 0)));
  const layers = useMemo(() => result?.layers?.map((l, i) => ({ ...l, color: recolor[i] ?? l.color })) ?? null, [result, recolor]);
  const svg = useMemo(
    () => (result && raster && applied ? (layers ? buildColorSvg(layers, raster.w, raster.h, applied.widthMm) : buildSvg(result.d, raster.w, raster.h, applied.widthMm)) : null),
    [result, raster, applied, layers],
  );
  const svgUrl = useMemo(() => (svg ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })) : null), [svg]);
  useEffect(() => () => void (svgUrl && URL.revokeObjectURL(svgUrl)), [svgUrl]);
  const overlay = useMemo(() => (result?.thin && result.thinCount > 0 && raster ? thinOverlay(result.thin, raster.w, raster.h) : null), [result, raster]);

  const name = file ? slug(file.name.replace(/\.[^.]+$/, "")) : "desenho";
  const paths = result ? (result.d.match(/M/g) ?? []).length : 0;

  async function onSave() {
    if (!svg) return;
    try {
      const p = await saveFile(`${name}.svg`, svg, "svg", "SVG");
      if (p) {
        toast(`SVG salvo em ${p}`);
        void tool.exported(name);
      }
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
      <p className="lead">Logo ou desenho vira SVG de 1 a 4 cores, em mm.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <Dropzone
              accept={IMAGE_ACCEPT}
              label={file ? file.name : "Arraste uma imagem ou clique"}
              hint="PNG, JPG, WebP, BMP, GIF ou AVIF · até 25 MB"
              onFile={onFile}
            />
          </div>
          <TraceSettings
            opts={opts}
            set={set}
            subject={subject}
            onSubject={setSubject}
            useFilaments={useFilaments}
            onUseFilaments={setUseFilaments}
            filamentCount={filColors.length}
            autoThreshold={result?.threshold ?? null}
            aspect={raster ? raster.h / raster.w : null}
          />
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
              <button disabled={!svg} onClick={() => sendTo("keychain")}>
                <KeyRound aria-hidden /> Fazer chaveiro
              </button>
              <button disabled={!svg} onClick={() => sendTo("medal")}>
                <Award aria-hidden /> Fazer medalha
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
                <button onClick={cancel}>
                  <X aria-hidden /> Cancelar
                </button>
              </>
            ) : (
              <>
                {/* um só botão cheio na tela: o Salvar SVG (#139) */}
                <button disabled={!raster} onClick={() => apply()}>
                  <Play aria-hidden /> {result ? "Aplicar alterações" : "Aplicar"}
                </button>
                <span className={dirty ? "dirty" : "muted"}>
                  {!raster
                    ? "Envie uma imagem para começar."
                    : dirty
                      ? "Há alterações não aplicadas."
                      : result
                        ? "Resultado atualizado."
                        : "Ajuste à esquerda e clique em Aplicar."}
                </span>
              </>
            )}
          </div>
          {isPhoto && !silhouette && (
            <Alert kind="warn">
              <p>
                <strong>Isso parece uma foto.</strong> O modo 1 cor funciona melhor com logos e desenhos. Use o modo Silhueta para recortar o contorno da pessoa
                ou do pet.
              </p>
              <button onClick={() => set("mode", "silhouette")}>Usar modo Silhueta</button>
            </Alert>
          )}
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
              <div className="img checker" style={{ opacity: running ? 0.5 : 1 }}>
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
          {layers && (
            <div className="card stack">
              <h3>Cores</h3>
              {layers.map((l, i) => (
                <label key={i} className="row">
                  <span className="swatch-inline">
                    <i style={{ background: l.color }} />
                  </span>
                  <span>Cor {i + 1}</span>
                  <select aria-label={`Filamento da cor ${i + 1}`} value={l.color} onChange={(e) => setRecolor((r) => ({ ...r, [i]: e.target.value }))}>
                    {!filColors.some((f) => f.hex === l.color) && <option value={l.color}>{l.color} (da imagem)</option>}
                    {filColors.map((f) => (
                      <option key={f.hex} value={f.hex}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          {result && (
            <div className="metrics" aria-live="polite">
              <span>
                Caminhos <b>{paths}</b>
              </span>
              <span>
                Área preenchida <b>{result.fillPct.toFixed(0)}%</b>
              </span>
              <span>
                Arquivo <b>{((svg?.length ?? 0) / 1024).toFixed(1)} KB</b>
              </span>
              <span>
                Tempo <b>{result.ms.toFixed(0)} ms</b>
              </span>
            </div>
          )}
          {result && result.thinCount > 0 && (
            <Alert kind="warn">
              <p>Trechos em vermelho ficam com menos de 0,4 mm nesta largura e podem não imprimir com bico 0,4.</p>
              {!applied?.thicken && (
                <button
                  disabled={running}
                  onClick={() => {
                    const next = { ...opts, thicken: true };
                    setOpts(next);
                    apply(next);
                  }}
                >
                  Engrossar traços finos automaticamente
                </button>
              )}
            </Alert>
          )}
          {result && paths === 0 && <Alert kind="warn">Nenhuma forma encontrada. Ajuste o limiar ou marque “claro sobre fundo escuro”.</Alert>}
          {result && result.fillPct > MOSTLY_FILLED && <Alert kind="warn">Quase tudo ficou preenchido. Confira o limiar e a inversão.</Alert>}
          {paths > MANY_PATHS && <Alert kind="warn">Mais de {MANY_PATHS} caminhos: aumente a Limpeza ou diminua o Detalhe.</Alert>}
        </div>
      </div>
    </div>
  );
}
