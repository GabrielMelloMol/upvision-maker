import { Download, Cookie, Layers } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Go } from "../pages";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import { saveFile, slug } from "../ui/saveFile";
import { errorText, useToast } from "../ui/Toast";
import { IMAGE_ACCEPT, latestTraceId, loadRaster, trace, type Raster } from "../vectorize/client";
import { scaleFactor } from "../vectorize/raster";
import { buildSvg } from "../vectorize/svgOut";
import { handoffSvg } from "./handoff";

type Result = Awaited<ReturnType<typeof trace>>;

const DEBOUNCE_MS = 150;
const MANY_PATHS = 5000;
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

export default function ImageToSvg({ go }: { go: Go }) {
  const [file, setFile] = useState<File | null>(null);
  const [raster, setRaster] = useState<Raster | null>(null);
  const [auto, setAuto] = useState(true);
  const [threshold, setThreshold] = useState(160);
  const [invert, setInvert] = useState(false);
  const [removeBg, setRemoveBg] = useState(true);
  const [widthMm, setWidthMm] = useState(80);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function onFile(f: File) {
    setError(null);
    setResult(null);
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

  useEffect(() => {
    if (!raster) return;
    const width = widthMm > 0 ? widthMm : 80;
    const timer = setTimeout(() => {
      setBusy(true);
      trace(raster, { threshold: auto ? null : threshold, invert, removeBg, widthMm: width })
        .then((r) => {
          if (r.id !== latestTraceId()) return; // resposta velha
          setResult(r);
          setError(null);
          if (auto) setThreshold(r.threshold);
        })
        .catch((e) => setError(errorText(e)))
        .finally(() => setBusy(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [raster, auto, threshold, invert, removeBg, widthMm]);

  const svg = useMemo(() => (result && raster ? buildSvg(result.d, raster.w, raster.h, widthMm > 0 ? widthMm : 80) : null), [result, raster, widthMm]);
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
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Limiar automático
            </label>
            <label>
              Quantidade preenchida: {threshold}
              <input type="range" min={20} max={245} value={threshold} disabled={auto} onChange={(e) => setThreshold(Number(e.target.value))} />
            </label>
            <label className="check">
              <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} /> Remover fundo automaticamente
            </label>
            <label className="check">
              <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} /> O desenho é claro sobre fundo escuro
            </label>
            <label>
              Largura final (mm)
              <input type="number" min={1} max={1000} value={widthMm} onChange={(e) => setWidthMm(Number(e.target.value))} />
              <span className="hint">A altura acompanha a proporção{raster ? `: ${((widthMm * raster.h) / raster.w).toFixed(1)} mm` : ""}.</span>
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
          {error && <Alert kind="error">{error}</Alert>}
          <div className="pair">
            <figure>
              <figcaption>Original</figcaption>
              <div className="img checker">{raster ? <img src={raster.url} alt="Imagem original" /> : <span className="muted">Nenhuma imagem</span>}</div>
            </figure>
            <figure>
              <figcaption>
                <span>SVG vetorizado</span>
                {busy && <span className="spinner" aria-label="Vetorizando" />}
              </figcaption>
              <div className="img" style={{ background: "#fff" }}>
                {svgUrl && raster ? (
                  <>
                    <img className="fit" src={svgUrl} alt="Resultado vetorizado" />
                    {overlay && <img className="fit" src={overlay} alt="" />}
                  </>
                ) : (
                  <span className="muted">{busy ? "Vetorizando…" : "O resultado aparece aqui"}</span>
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
          {paths > MANY_PATHS && <Alert kind="warn">Mais de {MANY_PATHS} caminhos: o arquivo pode ficar pesado no fatiador.</Alert>}
        </div>
      </div>
    </div>
  );
}
