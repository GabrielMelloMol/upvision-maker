import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bed } from "../geometry/bed";
import { loadFont, type FontId } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import { gcode3mf } from "../geometry/gcode3mf";
import { hersheyLines } from "../geometry/hershey";
import { AIR_MM, FILL_DEFAULTS, FillSettings, MARGIN_MM, orderStrokes, PEN_DEFAULTS, penGcode, PenSettings, placeOnBed, reach, withFill, type Fill, type Pen, type PenJob, type Stroke } from "../geometry/plotter";
import { svgLines } from "../geometry/svgImport";
import { textToCrossSection } from "../geometry/text";
import { exampleFile, useExample } from "../help/helpStore";
import Alert from "../ui/Alert";
import Dropzone from "../ui/Dropzone";
import FontPicker from "../ui/FontPicker";
import NumField from "../ui/NumField";
import { saveFile, slug } from "../ui/saveFile";
import Segmented from "../ui/Segmented";
import { errorText, useToast } from "../ui/Toast";
import { DESIGN_ACCEPT } from "./designInput";
import GeneratorHelp from "./models/guide/GeneratorHelp";
import { TOOL_HELP } from "./models/help/toolHelp";
import ToolSessionBar from "./ToolSessionBar";
import { initialDesign, useDesignInput } from "./useDesignInput";
import { useToolState } from "./useToolState";

type Source = "design" | "text";
const SOURCES = [["design", "Desenho ou imagem"], ["text", "Texto"]] as const;
type Lettering = "single" | "font";
const LETTERING = [["single", "Traço único"], ["font", "Contorno de uma fonte"]] as const;
const FILL_LABELS = [["outline", "Só contorno"], ["both", "Contorno + preencher"], ["fill", "Só preencher"]] as const;
const ANGLES = [["0", "0°"], ["45", "45°"], ["90", "90°"], ["135", "135°"]] as const;
type Format = "3mf" | "gcode";
const FORMATS = [["3mf", ".gcode.3mf (Bambu)"], ["gcode", ".gcode (outras)"]] as const;

const initial = () => ({ ...initialDesign(100), source: "design" as Source, text: "Obrigada!", lettering: "single" as Lettering, font: "sacramento" as FontId, pen: PEN_DEFAULTS as Pen, fill: FILL_DEFAULTS, format: "3mf" as Format });

/** Linhas do desenho ou do texto, Y para cima (o SVG vem com Y para baixo). */
async function linesOf(source: Source, svgText: string | null, text: string, lettering: Lettering, font: FontId) {
  if (source === "design") return svgText ? svgLines(svgText).map((l) => ({ ...l, pts: l.pts.map(([x, y]): [number, number] => [x, -y]) })) : null;
  if (!text.trim()) return null;
  if (lettering === "single") return hersheyLines(text);
  const M = await getManifold();
  const cs = textToCrossSection(M, await loadFont(font), text, 10);
  try {
    return cs.toPolygons().map((p) => ({ pts: p.map(([x, y]): [number, number] => [x, y]), closed: true }));
  } finally {
    cs.delete();
  }
}

export default function PenPlot() {
  const tool = useToolState("plotter", initial, { label: "Desenhar com caneta" });
  const s = tool.state;
  const { svg, width, setWidth, loading, error: inputError, onFile } = useDesignInput(s, (patch, key) => tool.set((cur) => ({ ...cur, ...patch }), key));
  const setPen = <K extends keyof Pen>(k: K) => (v: Pen[K]) => tool.set((cur) => ({ ...cur, pen: { ...cur.pen, [k]: v } }), `pen.${k}`);
  const fill: Fill = s.fill ?? FILL_DEFAULTS; // projetos salvos antes do preenchimento não têm o campo
  const setFill = <K extends keyof Fill>(k: K) => (v: Fill[K]) => tool.set((cur) => ({ ...cur, fill: { ...(cur.fill ?? FILL_DEFAULTS), [k]: v } }), `fill.${k}`);
  const lettering = s.lettering ?? "single";
  const format = s.format ?? "3mf";
  useExample("plotter", () => void exampleFile("heart").then(onFile)); // "Usar exemplo" da ajuda (#84)
  const toast = useToast();
  const b = bed();

  const penCheck = PenSettings.safeParse(s.pen);
  const fillCheck = FillSettings.safeParse(fill);
  const off = penCheck.success ? penCheck.data : { offX: 0, offY: 0 };
  const area = reach(b, off);
  const [built, setBuilt] = useState<{ strokes: Stroke[] | null; error: string | null }>({ strokes: null, error: null });
  const { strokes, error } = built;
  useEffect(() => {
    let alive = true;
    linesOf(s.source, svg?.text ?? null, s.text, lettering, s.font)
      .then((lines) => {
        if (!alive) return;
        const placed = lines && placeOnBed(lines, width, b, off);
        setBuilt({ strokes: placed && orderStrokes(fillCheck.success ? withFill(placed, fillCheck.data) : placed), error: null });
      })
      .catch((e) => alive && setBuilt({ strokes: null, error: errorText(e) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- off e fillCheck mudam de objeto a cada render; os valores estão nas dependências
  }, [s.source, svg, s.text, lettering, s.font, width, b, off.offX, off.offY, fillCheck.success, fill.mode, fill.spacing, fill.angle, fill.cross]);

  const job: PenJob | null = useMemo(() => {
    if (!strokes || !penCheck.success) return null;
    try {
      return penGcode(strokes, penCheck.data, b);
    } catch {
      return null;
    }
  }, [strokes, penCheck.success, penCheck.data, b]);

  const name = slug(s.source === "text" ? s.text : (svg?.name ?? "desenho"));
  async function onSave() {
    if (!job) return;
    try {
      const base = `${name}${s.pen.airTest ? "-teste-no-ar" : ""}`;
      const p =
        format === "3mf"
          ? await saveFile(`${base}.gcode.3mf`, gcode3mf(job.gcode, { printerName: b.name, minutes: job.minutes }), "3mf", "G-code da Bambu")
          : await saveFile(`${base}.gcode`, job.gcode, "gcode", "G-code");
      if (p) {
        toast(`G-code salvo em ${p}`);
        void tool.exported(name);
      }
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  return (
    <div className="page">
      <h1>Desenhar com caneta</h1>
      <p className="lead">A impressora desenha com uma caneta presa no cabeçote.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <Segmented label="O que desenhar" value={s.source} options={SOURCES} onChange={tool.field("source")} full />
            {s.source === "design" ? (
              <>
                <Dropzone accept={DESIGN_ACCEPT} label={svg ? svg.name : "Arraste um SVG ou imagem"} hint="Imagens são vetorizadas automaticamente; a caneta passa no contorno." onFile={onFile} />
                {loading && <Alert kind="info">Lendo o desenho…</Alert>}
                {inputError && <Alert kind="error">{inputError}</Alert>}
              </>
            ) : (
              <>
                <label>
                  Texto
                  <textarea rows={2} maxLength={200} value={s.text} onChange={(e) => tool.field("text")(e.target.value)} />
                </label>
                <Segmented label="Letra" value={lettering} options={LETTERING} onChange={tool.field("lettering")} full />
                {lettering === "single" ? (
                  <p className="hint">Letra cursiva de uma linha só, como escrita à mão: a caneta passa uma vez em cada letra. Aceita acentos e ç.</p>
                ) : (
                  <>
                    <FontPicker value={s.font} onChange={tool.field("font")} sample={s.text} />
                    <p className="hint">A caneta passa no contorno das letras; para letra cheia, use Preencher abaixo.</p>
                  </>
                )}
              </>
            )}
            <Segmented label="Preenchimento" value={fill.mode} options={FILL_LABELS} onChange={setFill("mode")} full />
            {fill.mode !== "outline" && (
              <div className="grid two">
                <NumField label="Espaço entre as linhas" value={fill.spacing} onChange={setFill("spacing")} min={0.2} max={5} step={0.1} hint="Menor = mais cheio (e mais demorado). Ponta de 0,5 mm: 0,5 a 0,7." />
                <div className="stack">
                  <Segmented label="Ângulo" value={String(fill.angle)} options={ANGLES} onChange={(v) => setFill("angle")(Number(v) as Fill["angle"])} />
                  <label className="check">
                    <input type="checkbox" checked={fill.cross} onChange={(e) => setFill("cross")(e.target.checked)} /> Cruzado (mais tinta)
                  </label>
                </div>
              </div>
            )}
            {!fillCheck.success && <Alert kind="error">{fillCheck.error.issues[0]?.message}</Alert>}
            <NumField label="Largura" value={width} onChange={setWidth} min={10} max={b.x - 2 * MARGIN_MM} step={1} hint={`Largura do desenho no papel; fica no meio de onde a caneta alcança na mesa de ${b.x} × ${b.y} mm${b.name ? ` (${b.name})` : ""}.`} />
          </div>
          <div className="card stack">
            <h3>Caneta</h3>
            <label className="check">
              <input type="checkbox" checked={s.pen.airTest} onChange={(e) => setPen("airTest")(e.target.checked)} /> Testar no ar (caneta {AIR_MM} mm acima do papel)
            </label>
            <div className="grid two">
              <NumField label="Altura ao desenhar" value={s.pen.zDraw} onChange={setPen("zDraw")} min={3} max={6} step={0.1} hint="5 = a ponta só encosta (é onde você ajustou a caneta). Traço fraco ou falhando: diminua de 0,1 em 0,1. Rasgando o papel: aumente." />
              <NumField label="Altura ao subir" value={s.pen.zLift} onChange={setPen("zLift")} min={7} max={30} step={0.5} hint="Z entre um traço e outro." />
              <NumField label="Velocidade de desenho" value={s.pen.drawFeed} onChange={setPen("drawFeed")} min={100} max={6000} step={100} unit="mm/min" />
              <NumField label="Velocidade do Z" value={s.pen.zFeed} onChange={setPen("zFeed")} min={60} max={1200} step={10} unit="mm/min" />
              <NumField label="Pausa depois de mexer o Z" value={s.pen.settleMs} onChange={setPen("settleMs")} min={0} max={2000} step={10} unit="ms" />
            </div>
            <h4>Onde a caneta fica</h4>
            <p className="hint">O suporte prende a caneta ao lado do bico. Com a régua, meça do centro do bico até a ponta da caneta, olhando a impressora de frente.</p>
            <div className="grid two">
              <NumField label="Caneta à direita do bico" value={s.pen.offX ?? 0} onChange={setPen("offX")} min={-80} max={80} step={0.5} hint="Negativo = à esquerda." />
              <NumField label="Caneta para trás do bico" value={s.pen.offY ?? 0} onChange={setPen("offY")} min={-80} max={80} step={0.5} hint="Negativo = para a frente." />
            </div>
            {!penCheck.success && <Alert kind="error">{penCheck.error.issues[0]?.message}</Alert>}
          </div>
          <div className="card stack">
            <Segmented label="Arquivo" value={format} options={FORMATS} onChange={tool.field("format")} full />
            <button className="action" disabled={!job} onClick={onSave}>
              <Download aria-hidden /> Salvar G-code
            </button>
            <p className="hint">Copie o arquivo para o cartão microSD da impressora e escolha-o na tela dela (não precisa abrir no Bambu Studio). As Bambu leem o .gcode.3mf; outras marcas, o .gcode.</p>
          </div>
          <GeneratorHelp help={TOOL_HELP.plotter} showTips />
        </div>

        <div className="preview-col">
          <Alert kind="warn">
            <p>
              <strong>Fique de olho na impressora.</strong> Comece sempre <strong>sem a caneta</strong>: a impressora zera, leva o bico ao meio da folha e pausa. Aí prenda o suporte, desça a caneta até a ponta encostar no papel, aperte e toque em Continuar na tela. Rode primeiro com “Testar no ar”.
              Ponha uma folha de plástico por baixo do papel para não riscar a mesa.
            </p>
          </Alert>
          {error && <Alert kind="error">{error}</Alert>}
          <figure>
            <figcaption>Mesa de {b.x} × {b.y} mm</figcaption>
            <svg className="plot-preview" viewBox={`0 0 ${b.x} ${b.y}`} role="img" aria-label="Prévia do desenho na mesa" style={{ width: "100%", maxHeight: "60vh", background: "#fff", border: "1px solid var(--line, #ccc)" }}>
              {/* Y da impressora para cima, Y da tela para baixo */}
              <g transform={`translate(0 ${b.y}) scale(1 -1)`}>
                {/* faixas que a caneta não alcança (o bico sairia da mesa) */}
                <path d={`M0 0H${b.x}V${b.y}H0Z M${area.x0} ${area.y0}V${area.y1}H${area.x1}V${area.y0}Z`} fill="#e9e9ee" fillRule="evenodd" aria-hidden />
                <rect x={area.x0 + MARGIN_MM} y={area.y0 + MARGIN_MM} width={area.x1 - area.x0 - 2 * MARGIN_MM} height={area.y1 - area.y0 - 2 * MARGIN_MM} fill="none" stroke="#ccc" strokeDasharray="3 3" strokeWidth={0.5} />
                {strokes?.map((st, i) => (
                  <polyline key={i} points={st.map((p) => p.join(",")).join(" ")} fill="none" stroke="#0B1F66" strokeWidth={0.4} strokeLinejoin="round" />
                ))}
              </g>
            </svg>
          </figure>
          {job && (
            <div className="metrics" aria-live="polite">
              <span>
                Traços <b>{job.strokes}</b>
              </span>
              <span>
                Linha <b>{(job.lengthMm / 1000).toFixed(1)} m</b>
              </span>
              <span>
                Tempo <b>~{Math.max(1, Math.round(job.minutes))} min</b>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
