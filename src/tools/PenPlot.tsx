import { ArrowDown, ArrowUp, Copy, Download, Eye, EyeOff, Files, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PRINTER_CATALOG, printerLabel } from "../domain/catalog/printers";
import { bed, parseVolume, type Bed } from "../geometry/bed";
import { gcode3mf } from "../geometry/gcode3mf";
import { AlphabetSchema } from "../geometry/handwriting";
import { contentKey, itemLines, itemName, legacyItems, newItem, type ItemKind, type Line, type PlotItem } from "../geometry/plotItems";
import { AIR_MM, FillSettings, inside, orderStrokes, PEN_DEFAULTS, penGcode, PenSettings, placeLines, drawArea, PAPER_DEFAULT, PaperSchema, reach, withFill, type Paper, type Pen, type PenJob } from "../geometry/plotter";
import { exampleFile, useExample } from "../help/helpStore";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Dropzone from "../ui/Dropzone";
import NumField from "../ui/NumField";
import { saveFile, slug } from "../ui/saveFile";
import Segmented from "../ui/Segmented";
import { errorText, useToast } from "../ui/Toast";
import { DESIGN_ACCEPT } from "./designInput";
import { SideView, TopView } from "./PenDiagram";
import PlotCanvas, { type Placed } from "./PlotCanvas";
import PlotItemEditor, { MODEL_ACCEPT, readPlotFile } from "./PlotItemEditor";
import { usePlotSim } from "./PlotSim";
import { useAlphabet } from "./MyLetters";
import GeneratorHelp from "./models/guide/GeneratorHelp";
import { TOOL_HELP } from "./models/help/toolHelp";
import ToolSessionBar from "./ToolSessionBar";
import { initialDesign } from "./useDesignInput";
import { useToolState } from "./useToolState";

type Format = "3mf" | "gcode";
const PAPER_OPTIONS = [["a4", "A4"], ["a5", "A5"], ["a6", "A6"], ["card", "10 × 15"], ["custom", "Outro"], ["bed", "Mesa toda"]] as const;
const FORMATS = [["3mf", ".gcode.3mf (Bambu)"], ["gcode", ".gcode (outras)"]] as const;
const ADD: [ItemKind, string][] = [["text", "Texto"], ["shape", "Forma"], ["design", "Desenho ou imagem"], ["model", "Peça 3D"], ["hand", "À mão livre"]];
/** Linhas do G-code mostradas na tela (o arquivo inteiro pode ter centenas de milhares). */
const GCODE_PREVIEW_LINES = 400;
/** Perfil em arquivo (#320): caneta, folha, impressora e a minha letra, para levar a outro computador. */
const PROFILE_APP = "upvision-caneta";

type State = { items: PlotItem[]; selected: string | null; pen: Pen; penBack?: boolean; penLeft?: boolean; format: Format; paper: Paper; /** id do catálogo; "" = a impressora das Preferências */ printer: string };

/** Meio de onde dá para desenhar (folha ou mesa): onde entra a camada nova. */
function centerOf(b: Bed, pen: Pen, paper: Paper): [number, number] {
  const { area } = drawArea(b, pen, PaperSchema.safeParse(paper).success ? paper : null);
  return [(area.x0 + area.x1) / 2, (area.y0 + area.y1) / 2];
}

function initial(): State {
  const d = initialDesign(100); // desenho vindo de Imagem → SVG
  const [x, y] = centerOf(bed(), PEN_DEFAULTS, PAPER_DEFAULT);
  const items = d.svg ? [{ ...newItem("design", { x, y, w: d.width, rot: 0 }), svg: d.svg }] : [];
  return { items, selected: items[0]?.id ?? null, pen: PEN_DEFAULTS, penBack: false, penLeft: false, format: "3mf", paper: PAPER_DEFAULT, printer: "" };
}

/** Rascunho de antes das camadas (#320) vira uma camada só. */
function load(raw: unknown): State | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.items)) return { printer: "", ...o } as State;
  const pen = (o.pen as Pen | undefined) ?? PEN_DEFAULTS;
  const paper = (o.paper as Paper | undefined) ?? PAPER_DEFAULT;
  const items = legacyItems(o, centerOf(bed(), pen, paper));
  return { items, selected: items[0]?.id ?? null, pen, penBack: o.penBack as boolean | undefined, penLeft: o.penLeft as boolean | undefined, format: (o.format as Format | undefined) ?? "3mf", paper, printer: "" };
}

export default function PenPlot() {
  const tool = useToolState<State>("plotter", initial, { label: "Desenhar com caneta", load });
  const s = tool.state;
  const items = s.items;
  const sel = items.find((i) => i.id === s.selected) ?? null;
  const setPen = <K extends keyof Pen>(k: K) => (v: Pen[K]) => tool.set((cur) => ({ ...cur, pen: { ...cur.pen, [k]: v } }), `pen.${k}`);
  const [alphabet, saveAlphabet] = useAlphabet();
  const toast = useToast();

  const cat = PRINTER_CATALOG.find((p) => p.id === s.printer);
  const b: Bed = useMemo(() => {
    const v = cat && parseVolume(cat.volume);
    return cat && v ? { ...v, name: printerLabel(cat) } : bed();
  }, [cat]);
  const penCheck = PenSettings.safeParse(s.pen);
  const off = penCheck.success ? penCheck.data : { offX: 0, offY: 0 };
  const paper: Paper = s.paper ?? PAPER_DEFAULT;
  const paperCheck = PaperSchema.safeParse(paper);
  const setPaper = (patch: Partial<Paper>) => tool.set((cur) => ({ ...cur, paper: { ...(cur.paper ?? PAPER_DEFAULT), ...patch } }), "paper");
  const sheetOk = paperCheck.success ? paperCheck.data : null;
  const area = reach(b, off);
  const { area: usable, sheet, cut } = drawArea(b, off, sheetOk);
  const [cx, cy] = [(usable.x0 + usable.x1) / 2, (usable.y0 + usable.y1) / 2];
  const where = sheet ? "na folha" : usable.x1 - usable.x0 < b.x || usable.y1 - usable.y0 < b.y ? "na área que a caneta alcança" : "na mesa";

  // camadas
  const setItems = (f: (list: PlotItem[]) => PlotItem[], key: string, selected?: string | null) => tool.set((cur) => ({ ...cur, items: f(cur.items), ...(selected !== undefined ? { selected } : {}) }), key);
  const setItem = (id: string, patch: Partial<PlotItem>, key: string) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)), `${key}:${id}`);
  const select = (id: string | null) => tool.set((cur) => ({ ...cur, selected: id }), "selected");
  function add(kind: ItemKind, patch: Partial<PlotItem> = {}) {
    const w = Math.max(10, Math.min(100, Math.floor(usable.x1 - usable.x0 - 10)));
    const it = { ...newItem(kind, { x: cx, y: cy, w, rot: 0 }), ...patch };
    setItems((list) => [...list, it], "add", it.id);
  }
  const moveItem = (id: string, by: -1 | 1) =>
    setItems((list) => {
      const i = list.findIndex((x) => x.id === id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    }, "order");
  const duplicate = (it: PlotItem) => {
    const copy = { ...it, id: crypto.randomUUID(), x: it.x + 10, y: it.y - 10 };
    setItems((list) => [...list, copy], "add", copy.id);
  };
  const remove = (id: string) => setItems((list) => list.filter((x) => x.id !== id), "remove", s.selected === id ? null : s.selected);

  const [addError, setAddError] = useState<string | null>(null);
  async function addFile(f: File) {
    setAddError(null);
    try {
      const patch = await readPlotFile(f);
      add(patch.kind ?? "design", patch);
    } catch (e) {
      setAddError(errorText(e));
    }
  }
  useExample("plotter", () => void exampleFile("heart").then(addFile)); // "Usar exemplo" da ajuda (#84)

  // linhas de cada camada: só recalcula quando o conteúdo muda (mover e girar não)
  const [built, setBuilt] = useState<Record<string, { key: string; lines: Line[] | null; error: string | null }>>({});
  const pending = useRef(new Set<string>());
  useEffect(() => {
    for (const it of items) {
      const key = contentKey(it, alphabet);
      const job = `${it.id}|${key}`;
      if (built[it.id]?.key === key || pending.current.has(job)) continue;
      pending.current.add(job);
      void itemLines(it, alphabet)
        .then(
          (lines) => ({ key, lines, error: null }),
          (e: unknown) => ({ key, lines: null, error: errorText(e) }),
        )
        .then((r) => {
          pending.current.delete(job);
          setBuilt((cur) => ({ ...cur, [it.id]: r }));
        });
    }
  }, [items, alphabet, built]);

  const { placed, problems } = useMemo(() => {
    const placed: Placed[] = [];
    const problems: string[] = [];
    for (const it of items) {
      const r = built[it.id];
      if (r?.error) problems.push(`${itemName(it)}: ${r.error}`);
      if (it.hidden || !r?.lines) continue;
      try {
        const { strokes, w, h } = placeLines(r.lines, it);
        const fill = FillSettings.safeParse(it.fill);
        if (!fill.success) problems.push(`${itemName(it)}: ${fill.error.issues[0]?.message}`);
        const all = fill.success ? withFill(strokes, fill.data) : strokes;
        const out = !inside(all, usable);
        if (out) problems.push(`“${itemName(it)}” não cabe ${where}. Diminua, mova ou gire até a caixa ficar laranja.`);
        placed.push({ id: it.id, label: itemName(it), strokes: all, hw: Math.max(1.5, w / 2), hh: Math.max(1.5, h / 2), out, x: it.x, y: it.y, w: it.w, rot: it.rot });
      } catch (e) {
        problems.push(`${itemName(it)}: ${errorText(e)}`);
      }
    }
    return { placed, problems };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- usable muda de objeto a cada render; os valores estão nas dependências
  }, [items, built, usable.x0, usable.y0, usable.x1, usable.y1, where]);

  const strokes = useMemo(() => (placed.length && !problems.length ? orderStrokes(placed.flatMap((p) => p.strokes)) : null), [placed, problems]);
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

  const first = items.find((i) => !i.hidden);
  const name = slug(first ? itemName(first) : "desenho");
  async function onSave() {
    if (!job) return;
    try {
      const base = `${name}${s.pen.airTest ? "-teste-no-ar" : ""}`;
      const p =
        s.format === "3mf"
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
  async function onCopy() {
    if (!job) return;
    try {
      await navigator.clipboard.writeText(job.gcode);
      toast("G-code copiado.");
    } catch (e) {
      toast(`Não foi possível copiar: ${errorText(e)}`, "error");
    }
  }
  async function saveProfile() {
    try {
      const data = { app: PROFILE_APP, v: 1, pen: s.pen, penBack: back, penLeft: left, paper, printer: s.printer, alphabet };
      const p = await saveFile("perfil-caneta.json", JSON.stringify(data, null, 2), "json", "Perfil da caneta");
      if (p) toast(`Perfil salvo em ${p}`);
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }
  async function openProfile(f: File) {
    try {
      const o = JSON.parse(await f.text()) as Record<string, unknown>;
      if (o.app !== PROFILE_APP) throw new Error("Este arquivo não é um perfil da caneta.");
      const pen = PenSettings.parse(o.pen);
      const pp = PaperSchema.parse(o.paper);
      const printer = typeof o.printer === "string" && PRINTER_CATALOG.some((p) => p.id === o.printer) ? o.printer : "";
      const letters = o.alphabet && typeof o.alphabet === "object" && Object.keys(o.alphabet).length ? AlphabetSchema.parse(o.alphabet) : null;
      tool.set((cur) => ({ ...cur, pen, paper: pp, printer, penBack: o.penBack === true, penLeft: o.penLeft === true }), "profile");
      if (letters) await saveAlphabet(letters);
      toast("Perfil aberto.");
    } catch (e) {
      toast(`Não foi possível abrir o perfil: ${errorText(e)}`, "error");
    }
  }
  const gcodeLines = job?.gcode.split("\n");
  const prefs = bed();

  return (
    <div className="page">
      <h1>Desenhar com caneta</h1>
      <p className="lead">A impressora desenha com uma caneta presa no cabeçote.</p>
      <ToolSessionBar tool={tool} />
      <div className="tool-layout">
        <div className="controls">
          <div className="card stack">
            <h3>Camadas</h3>
            <div className="row" role="group" aria-label="Adicionar à mesa" style={{ flexWrap: "wrap", gap: 6 }}>
              {ADD.map(([k, l]) => (
                <Button key={k} size="sm" onClick={() => add(k)}>
                  {l}
                </Button>
              ))}
            </div>
            <Dropzone accept={`${DESIGN_ACCEPT},${MODEL_ACCEPT}`} label="Ou arraste um desenho, imagem ou peça 3D" hint="SVG, foto ou .3mf/.stl: vira uma camada nova no meio da folha." onFile={addFile} compact={items.length > 0} />
            {addError && <Alert kind="error">{addError}</Alert>}
            {items.length > 0 && (
              <ul className="stack" aria-label="Camadas" style={{ listStyle: "none", padding: 0, margin: 0, gap: 4 }}>
                {[...items].reverse().map((it) => (
                  <li key={it.id} className="row" style={{ alignItems: "center", gap: 4 }}>
                    <button type="button" aria-pressed={it.id === s.selected} onClick={() => select(it.id)} style={{ flex: 1, justifyContent: "flex-start", opacity: it.hidden ? 0.5 : 1 }}>
                      {itemName(it)}
                    </button>
                    <button type="button" className="icon-button" aria-label={`Subir ${itemName(it)}`} onClick={() => moveItem(it.id, 1)}>
                      <ArrowUp aria-hidden />
                    </button>
                    <button type="button" className="icon-button" aria-label={`Descer ${itemName(it)}`} onClick={() => moveItem(it.id, -1)}>
                      <ArrowDown aria-hidden />
                    </button>
                    <button type="button" className="icon-button" aria-pressed={!!it.hidden} aria-label={`Esconder ${itemName(it)}`} onClick={() => setItem(it.id, { hidden: !it.hidden }, "hidden")}>
                      {it.hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    </button>
                    <button type="button" className="icon-button" aria-label={`Duplicar ${itemName(it)}`} onClick={() => duplicate(it)}>
                      <Files aria-hidden />
                    </button>
                    <button type="button" className="icon-button" aria-label={`Apagar ${itemName(it)}`} onClick={() => remove(it.id)}>
                      <Trash2 aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {items.length > 1 && <p className="hint">A camada de cima da lista fica na frente na prévia. No papel a ordem não muda nada: a impressora faz o caminho mais curto entre todos os traços. Camada escondida não sai no G-code.</p>}
          </div>
          {sel && (
            <div className="card stack">
              <h3>{itemName(sel)}</h3>
              <PlotItemEditor key={sel.id} item={sel} set={(patch, key) => setItem(sel.id, patch, key)} alphabet={alphabet} saveAlphabet={saveAlphabet} />
              <h4>Lugar na mesa</h4>
              <div className="grid two">
                <NumField label="Largura" value={sel.w} onChange={(v) => setItem(sel.id, { w: v }, "w")} min={2} max={500} step={1} />
                <NumField label="Giro" value={sel.rot} onChange={(v) => setItem(sel.id, { rot: v }, "rot")} min={-180} max={180} step={1} unit="°" />
                <NumField label="X do meio" value={sel.x} onChange={(v) => setItem(sel.id, { x: v }, "x")} min={-500} max={1000} step={1} hint="0 = canto esquerdo da mesa." />
                <NumField label="Y do meio" value={sel.y} onChange={(v) => setItem(sel.id, { y: v }, "y")} min={-500} max={1000} step={1} hint="0 = frente da mesa." />
              </div>
              <Button onClick={() => setItem(sel.id, { x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10 }, "center")}>Centralizar {sheet ? "na folha" : "na mesa"}</Button>
            </div>
          )}
          <div className="card stack">
            <h3>Impressora e folha</h3>
            <label>
              Impressora
              <select value={s.printer} onChange={(e) => tool.set((cur) => ({ ...cur, printer: e.target.value }), "printer")}>
                <option value="">
                  A das Preferências{prefs.name ? ` (${prefs.name})` : ""}, {prefs.x} × {prefs.y} mm
                </option>
                {PRINTER_CATALOG.flatMap((p) => {
                  const v = parseVolume(p.volume);
                  return v ? [
                    <option key={p.id} value={p.id}>
                      {printerLabel(p)}, {v.x} × {v.y} mm
                    </option>,
                  ] : [];
                })}
              </select>
            </label>
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
              <NumField label="Velocidade de viagem" value={s.pen.travelFeed ?? PEN_DEFAULTS.travelFeed} onChange={setPen("travelFeed")} min={600} max={12000} step={100} unit="mm/min" hint="Com a caneta no alto, de um traço ao outro." />
              <NumField label="Velocidade do Z" value={s.pen.zFeed} onChange={setPen("zFeed")} min={60} max={1200} step={10} unit="mm/min" />
              <NumField label="Pausa depois de mexer o Z" value={s.pen.settleMs} onChange={setPen("settleMs")} min={0} max={2000} step={10} unit="ms" hint="Espera a caneta subir ou descer de vez antes de andar. Risquinho sobrando entre os traços: aumente (150 a 250)." />
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
            <h4>Se o teste sair errado</h4>
            <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
              <label className="check">
                <input type="checkbox" checked={!!s.pen.mirrorX} onChange={(e) => setPen("mirrorX")(e.target.checked)} /> Espelhar na horizontal
              </label>
              <label className="check">
                <input type="checkbox" checked={!!s.pen.mirrorY} onChange={(e) => setPen("mirrorY")(e.target.checked)} /> Espelhar na vertical
              </label>
              <label className="check">
                <input type="checkbox" checked={!!s.pen.motorsOff} onChange={(e) => setPen("motorsOff")(e.target.checked)} /> Soltar os motores no fim
              </label>
            </div>
            <p className="hint">Se o teste no ar sair invertido (texto ao contrário), marque o espelhar do lado que inverteu e salve de novo. Soltar os motores deixa mover o cabeçote com a mão depois de desenhar.</p>
            {!penCheck.success && <Alert kind="error">{penCheck.error.issues[0]?.message}</Alert>}
          </div>
          <div className="card stack">
            <Segmented label="Arquivo" value={s.format} options={FORMATS} onChange={(v) => tool.set((cur) => ({ ...cur, format: v }), "format")} full />
            <button className="action" disabled={!job} onClick={onSave}>
              <Download aria-hidden /> Salvar G-code
            </button>
            <div className="row">
              <Button icon={Copy} disabled={!job} onClick={onCopy}>
                Copiar G-code
              </Button>
            </div>
            {job && gcodeLines && (
              <details>
                <summary>Ver o G-code ({gcodeLines.length} linhas)</summary>
                <textarea readOnly aria-label="G-code" rows={12} style={{ width: "100%", fontFamily: "ui-monospace, monospace", fontSize: 12 }} value={gcodeLines.slice(0, GCODE_PREVIEW_LINES).join("\n") + (gcodeLines.length > GCODE_PREVIEW_LINES ? `\n… mais ${gcodeLines.length - GCODE_PREVIEW_LINES} linhas no arquivo` : "")} />
              </details>
            )}
            <h4>Como mandar para a impressora</h4>
            <ol className="hint" style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 4 }}>
              <li>Salve o arquivo e copie para o <strong>cartão microSD</strong> da impressora (na A1, ele fica na frente, embaixo da tela). Use um leitor de cartão no computador.</li>
              <li>Ponha o cartão de volta, toque no ícone de <strong>pasta (Arquivos)</strong> na tela da impressora e escolha o arquivo.</li>
              <li>Toque em Imprimir. A impressora não aquece nem puxa filamento: só zera, leva o bico ao meio e pausa para você prender a caneta.</li>
            </ol>
            <p className="hint">Não precisa abrir no Bambu Studio. As Bambu leem o .gcode.3mf; outras marcas, o .gcode.</p>
            <h4>Meu perfil</h4>
            <p className="hint">Guarda a caneta, a folha, a impressora e a sua letra num arquivo, para usar em outro computador.</p>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <Button onClick={saveProfile}>Salvar perfil</Button>
              <Dropzone accept=".json,application/json" label="Abrir perfil" onFile={openProfile} compact />
            </div>
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
          {problems.map((p) => (
            <Alert key={p} kind="error">
              {p}
            </Alert>
          ))}
          <figure>
            <figcaption>
              {b.name ?? "Mesa"}: {b.x} × {b.y} mm
            </figcaption>
            <PlotCanvas bed={b} area={area} sheet={sheet} items={placed} selected={s.selected} onSelect={select} onPlace={(id, p, key) => setItem(id, p, key)} faded={sim.simulating}>
              {sim.layer}
            </PlotCanvas>
            <figcaption>
              {items.length ? "Clique para escolher · arraste para mover · quadradinho do canto muda o tamanho · bolinha de cima gira. " : "Adicione um texto, uma forma ou um desenho para começar. "}
              {sheet ? `Folha de ${Math.round(sheet.x1 - sheet.x0)} × ${Math.round(sheet.y1 - sheet.y0)} mm; a cruz é o meio, onde a caneta para no começo.` : "A área cinza é onde a caneta não alcança."}
            </figcaption>
          </figure>
          {sim.controls}
          {job && (
            <div className="metrics" aria-live="polite">
              <span>
                Camadas <b>{placed.length}</b>
              </span>
              <span>
                Traços <b>{job.strokes}</b>
              </span>
              <span>
                Tinta <b>{(job.lengthMm / 1000).toFixed(1)} m</b>
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
