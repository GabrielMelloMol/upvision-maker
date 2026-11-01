import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bed } from "../geometry/bed";
import { loadFont, type FontId } from "../geometry/fonts";
import { getManifold } from "../geometry/manifold";
import { gcode3mf } from "../geometry/gcode3mf";
import { handLines, myLines, type Strokes } from "../geometry/handwriting";
import { hersheyLines } from "../geometry/hershey";
import { AIR_MM, FILL_DEFAULTS, FillSettings, MARGIN_MM, orderStrokes, PEN_DEFAULTS, penGcode, PenSettings, placeOnBed, drawArea, PAPER_DEFAULT, PaperSchema, reach, withFill, type Fill, type Paper, type Pen, type PenJob, type Stroke } from "../geometry/plotter";
import { svgLines } from "../geometry/svgImport";
import { textToCrossSection } from "../geometry/text";
import { exampleFile, useExample } from "../help/helpStore";
import type { Alphabet } from "../geometry/handwriting";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Dropzone from "../ui/Dropzone";
import FontPicker from "../ui/FontPicker";
import NumField from "../ui/NumField";
import { saveFile, slug } from "../ui/saveFile";
import Segmented from "../ui/Segmented";
import { errorText, useToast } from "../ui/Toast";
import { DESIGN_ACCEPT } from "./designInput";
import DrawPad from "./DrawPad";
import { SideView, TopView } from "./PenDiagram";
import { usePlotSim } from "./PlotSim";
import MyLettersSheet, { useAlphabet } from "./MyLetters";
import GeneratorHelp from "./models/guide/GeneratorHelp";
import { TOOL_HELP } from "./models/help/toolHelp";
import ToolSessionBar from "./ToolSessionBar";
import { initialDesign, useDesignInput } from "./useDesignInput";
import { useToolState } from "./useToolState";

type Source = "design" | "text" | "hand";
const SOURCES = [["design", "Desenho ou imagem"], ["text", "Texto"], ["hand", "À mão livre"]] as const;
type Lettering = "single" | "mine" | "font";
const LETTERING = [["single", "Cursiva"], ["mine", "Minha letra"], ["font", "Contorno de uma fonte"]] as const;
const FILL_LABELS = [["outline", "Só contorno"], ["both", "Contorno + preencher"], ["fill", "Só preencher"]] as const;
const ANGLES = [["0", "0°"], ["45", "45°"], ["90", "90°"], ["135", "135°"]] as const;
type Format = "3mf" | "gcode";
const PAPER_OPTIONS = [["a4", "A4"], ["a5", "A5"], ["a6", "A6"], ["card", "10 × 15"], ["custom", "Outro"], ["bed", "Mesa toda"]] as const;
const FORMATS = [["3mf", ".gcode.3mf (Bambu)"], ["gcode", ".gcode (outras)"]] as const;

const initial = () => ({ ...initialDesign(100), source: "design" as Source, text: "Obrigada!", lettering: "single" as Lettering, font: "sacramento" as FontId, pen: PEN_DEFAULTS as Pen, fill: FILL_DEFAULTS, format: "3mf" as Format, paper: PAPER_DEFAULT as Paper, penBack: false as boolean | undefined, penLeft: false as boolean | undefined, hand: [] as Strokes, variation: 0.5 });

/** Linhas do desenho ou do texto, Y para cima (o SVG vem com Y para baixo). */
async function linesOf(source: Source, svgText: string | null, text: string, lettering: Lettering, font: FontId, mine: { alphabet: Alphabet; variation: number; hand: Strokes }) {
  if (source === "hand") return mine.hand.length ? handLines(mine.hand) : null;
  if (source === "design") return svgText ? svgLines(svgText).map((l) => ({ ...l, pts: l.pts.map(([x, y]): [number, number] => [x, -y]) })) : null;
  if (!text.trim()) return null;
  if (lettering === "single") return hersheyLines(text);
  if (lettering === "mine") return myLines(text, mine.alphabet, mine.variation);
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
  const hand = s.hand ?? []; // projetos salvos antes da mão livre (#314) não têm os campos
  const variation = s.variation ?? 0.5;
  const [alphabet, saveAlphabet] = useAlphabet();
  const [lettersOpen, setLettersOpen] = useState(false);
  useExample("plotter", () => void exampleFile("heart").then(onFile)); // "Usar exemplo" da ajuda (#84)
  const toast = useToast();
  const b = bed();

  const penCheck = PenSettings.safeParse(s.pen);
  const fillCheck = FillSettings.safeParse(fill);
  const off = penCheck.success ? penCheck.data : { offX: 0, offY: 0 };
  const paper: Paper = s.paper ?? PAPER_DEFAULT; // projetos de antes do papel (#317)
  const paperCheck = PaperSchema.safeParse(paper);
  const setPaper = (patch: Partial<Paper>) => tool.set((cur) => ({ ...cur, paper: { ...(cur.paper ?? PAPER_DEFAULT), ...patch } }), "paper");
  const sheetOk = paperCheck.success ? paperCheck.data : null;
  const area = reach(b, off);
  const { area: usable, sheet, cut } = drawArea(b, off, sheetOk);
  const [built, setBuilt] = useState<{ strokes: Stroke[] | null; error: string | null }>({ strokes: null, error: null });
  const { strokes, error } = built;
  useEffect(() => {
    let alive = true;
    linesOf(s.source, svg?.text ?? null, s.text, lettering, s.font, { alphabet, variation, hand })
      .then((lines) => {
        if (!alive) return;
        const placed = lines && placeOnBed(lines, width, b, off, sheetOk);
        setBuilt({ strokes: placed && orderStrokes(fillCheck.success ? withFill(placed, fillCheck.data) : placed), error: null });
      })
      .catch((e) => alive && setBuilt({ strokes: null, error: errorText(e) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- off e fillCheck mudam de objeto a cada render; os valores estão nas dependências
  }, [s.source, svg, s.text, lettering, s.font, alphabet, variation, hand, width, b, off.offX, off.offY, fillCheck.success, fill.mode, fill.spacing, fill.angle, fill.cross, sheetOk?.size, sheetOk?.w, sheetOk?.h, sheetOk?.landscape]);
  const sim = usePlotSim(strokes, penCheck.success ? penCheck.data.drawFeed : 1500);
  // a caneta: direção + distância na tela; com sinal no estado (X + = direita, Y + = para trás)
  const offX = s.pen.offX ?? 0;
  const offY = s.pen.offY ?? 0;
  // a direção fica guardada à parte: com distância 0 o sinal se perde
  const back = s.penBack ?? offY > 0;
  const left = s.penLeft ?? offX < 0;
  const setDir = (k: "penBack" | "penLeft", v: boolean) =>
    tool.set((cur) => ({ ...cur, [k]: v, pen: { ...cur.pen, ...(k === "penBack" ? { offY: Math.abs(cur.pen.offY ?? 0) * (v ? 1 : -1) } : { offX: Math.abs(cur.pen.offX ?? 0) * (v ? -1 : 1) }) } }), k);

  const job: PenJob | null = useMemo(() => {
    if (!strokes || !penCheck.success) return null;
    try {
      return penGcode(strokes, penCheck.data, b);
    } catch {
      return null;
    }
  }, [strokes, penCheck.success, penCheck.data, b]);

  const name = slug(s.source === "text" ? s.text : s.source === "hand" ? "mao-livre" : (svg?.name ?? "desenho"));
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
            {s.source === "hand" ? (
              <>
                <DrawPad strokes={hand} onChange={(v) => tool.set((cur) => ({ ...cur, hand: v }), "hand")} label="Quadro para desenhar à mão livre" size={300} />
                <div className="row">
                  <Button disabled={!hand.length} onClick={() => tool.set((cur) => ({ ...cur, hand: hand.slice(0, -1) }), "hand")}>
                    Desfazer traço
                  </Button>
                  <Button disabled={!hand.length} onClick={() => tool.set((cur) => ({ ...cur, hand: [] }), "hand")}>
                    Limpar
                  </Button>
                </div>
                <p className="hint">Desenhe com o mouse, a caneta do tablet ou o dedo. A Largura abaixo define o tamanho no papel.</p>
              </>
            ) : s.source === "design" ? (
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
                ) : lettering === "mine" ? (
                  <>
                    <Button onClick={() => setLettersOpen(true)}>{Object.keys(alphabet).length ? "Desenhar mais letras" : "Desenhar a minha letra"}</Button>
                    <NumField label="Variação entre as letras" value={variation} onChange={(v) => tool.set((cur) => ({ ...cur, variation: v }), "variation")} min={0} max={1} step={0.1} unit="" hint="0 = todas alinhadas; 1 = cada letra sobe, desce e anda um pouco, como escrita de verdade." />
                    <p className="hint">{Object.keys(alphabet).length} letras desenhadas; as que faltam saem na cursiva.</p>
                    {lettersOpen && <MyLettersSheet alphabet={alphabet} onSave={saveAlphabet} onClose={() => setLettersOpen(false)} />}
                  </>
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
            <NumField label="Largura" value={width} onChange={setWidth} min={10} max={Math.max(10, Math.floor(usable.x1 - usable.x0 - 2 * MARGIN_MM))} step={1} hint={`Largura do desenho; ele fica no meio da ${sheet ? "folha" : "mesa"}. Cabe até ${Math.floor(usable.x1 - usable.x0 - 2 * MARGIN_MM)} × ${Math.floor(usable.y1 - usable.y0 - 2 * MARGIN_MM)} mm.`} />
          </div>
          <div className="card stack">
            <h3>Folha</h3>
            <Segmented label="Tamanho da folha" value={paper.size} options={PAPER_OPTIONS} onChange={(v) => setPaper({ size: v })} full />
            {paper.size === "custom" && (
              <div className="grid two">
                <NumField label="Largura da folha" value={paper.w} onChange={(v) => setPaper({ w: v })} min={20} max={500} step={1} />
                <NumField label="Altura da folha" value={paper.h} onChange={(v) => setPaper({ h: v })} min={20} max={500} step={1} />
              </div>
            )}
            {paper.size !== "bed" && (
              <label className="check">
                <input type="checkbox" checked={paper.landscape} onChange={(e) => setPaper({ landscape: e.target.checked })} /> Folha deitada
              </label>
            )}
            {!paperCheck.success && <Alert kind="error">{paperCheck.error.issues[0]?.message}</Alert>}
            {cut && <Alert kind="warn">A folha é maior que a área que a caneta alcança na mesa de {b.x} × {b.y} mm: o desenho fica só na parte do meio dela (a área branca da prévia).</Alert>}
            {sheet && <p className="hint">Para centralizar: dobre a folha ao meio nos dois sentidos e marque o centro. Na pausa do começo, a ponta da caneta para no meio da mesa: ponha o centro da folha embaixo dela e prenda com fita ou ímãs.</p>}
          </div>
          <div className="card stack">
            <h3>Caneta</h3>
            <p className="hint">
              Use caneta de ponta fina que escreve com pouca força: <strong>caneta hidrográfica fina ou fineliner</strong> (tipo Stabilo Point 88 ou Faber-Castell Fine Pen 0,4). Esferográfica (BIC) também serve, mas precisa apertar mais e falha mais. Gel borra se a velocidade for alta.
            </p>
            <SideView zDraw={s.pen.zDraw} zLift={s.pen.zLift} air={s.pen.airTest} />
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
            <p className="hint">
              O suporte prende a caneta perto do bico (na maioria, <strong>na frente</strong> dele). Com a caneta no suporte, olhe a impressora de frente e meça com a régua do centro do bico até a ponta da caneta: quanto ela está para a frente (ou para trás) e quanto para o lado. Assim o app desenha no lugar certo.
            </p>
            <TopView offX={offX} offY={offY} />
            <div className="grid two">
              <div className="stack">
                <Segmented label="Frente ou trás" value={back ? "back" : "front"} options={[["front", "Na frente"], ["back", "Atrás"]] as const} onChange={(v) => setDir("penBack", v === "back")} />
                <NumField label="Distância para a frente ou para trás" value={Math.abs(offY)} onChange={(v) => setPen("offY")(v * (back ? 1 : -1))} min={0} max={80} step={0.5} hint="0 = na mesma linha do bico." />
              </div>
              <div className="stack">
                <Segmented label="Lado" value={left ? "left" : "right"} options={[["left", "À esquerda"], ["right", "À direita"]] as const} onChange={(v) => setDir("penLeft", v === "left")} />
                <NumField label="Distância para o lado" value={Math.abs(offX)} onChange={(v) => setPen("offX")(v * (left ? -1 : 1))} min={0} max={80} step={0.5} hint="0 = bem no meio do bico." />
              </div>
            </div>
            {!penCheck.success && <Alert kind="error">{penCheck.error.issues[0]?.message}</Alert>}
          </div>
          <div className="card stack">
            <Segmented label="Arquivo" value={format} options={FORMATS} onChange={tool.field("format")} full />
            <button className="action" disabled={!job} onClick={onSave}>
              <Download aria-hidden /> Salvar G-code
            </button>
            <h4>Como mandar para a impressora</h4>
            <ol className="hint" style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 4 }}>
              <li>Salve o arquivo e copie para o <strong>cartão microSD</strong> da impressora (na A1, ele fica na frente, embaixo da tela). Use um leitor de cartão no computador.</li>
              <li>Ponha o cartão de volta, toque no ícone de <strong>pasta (Arquivos)</strong> na tela da impressora e escolha o arquivo.</li>
              <li>Toque em Imprimir. A impressora não aquece nem puxa filamento: só zera, leva o bico ao meio e pausa para você prender a caneta.</li>
            </ol>
            <p className="hint">Não precisa abrir no Bambu Studio. As Bambu leem o .gcode.3mf; outras marcas, o .gcode.</p>
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
            <svg className="plot-preview" viewBox={`0 0 ${b.x} ${b.y}`} role="img" aria-label="Prévia do desenho na mesa" style={{ width: "100%", maxHeight: "60vh", background: "#f3f4f8", border: "1px solid var(--line, #ccc)" }}>
              {/* Y da impressora para cima, Y da tela para baixo */}
              <g transform={`translate(0 ${b.y}) scale(1 -1)`}>
                {/* faixas que a caneta não alcança (o bico sairia da mesa) */}
                <path d={`M0 0H${b.x}V${b.y}H0Z M${area.x0} ${area.y0}V${area.y1}H${area.x1}V${area.y0}Z`} fill="#e9e9ee" fillRule="evenodd" aria-hidden />
                {sheet && <rect x={sheet.x0} y={sheet.y0} width={sheet.x1 - sheet.x0} height={sheet.y1 - sheet.y0} fill="#fff" stroke="#9aa3c7" strokeWidth={0.6} aria-hidden />}
                {sheet && <path d={`M${(sheet.x0 + sheet.x1) / 2 - 4} ${(sheet.y0 + sheet.y1) / 2}h8M${(sheet.x0 + sheet.x1) / 2} ${(sheet.y0 + sheet.y1) / 2 - 4}v8`} stroke="#9aa3c7" strokeWidth={0.5} aria-hidden />}
                <rect x={usable.x0 + MARGIN_MM} y={usable.y0 + MARGIN_MM} width={usable.x1 - usable.x0 - 2 * MARGIN_MM} height={usable.y1 - usable.y0 - 2 * MARGIN_MM} fill="none" stroke="#ccc" strokeDasharray="3 3" strokeWidth={0.5} />
                {strokes?.map((st, i) => (
                  <polyline key={i} points={st.map((p) => p.join(",")).join(" ")} fill="none" stroke={sim.simulating ? "#c9cde0" : "#0B1F66"} strokeWidth={0.4} strokeLinejoin="round" />
                ))}
                {sim.layer}
              </g>
            </svg>
            <figcaption>{sheet ? `Folha de ${Math.round(sheet.x1 - sheet.x0)} × ${Math.round(sheet.y1 - sheet.y0)} mm; a cruz é o meio, onde a caneta para no começo.` : "A área cinza é onde a caneta não alcança."}</figcaption>
          </figure>
          {sim.controls}
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
