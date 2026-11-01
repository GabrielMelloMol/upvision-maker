import { useState } from "react";
import type { Alphabet } from "../geometry/handwriting";
import { modelOutline } from "../geometry/modelOutline";
import type { Fill } from "../geometry/plotter";
import type { PlotItem } from "../geometry/plotItems";
import { SHAPES, SHAPE_DEFAULT, SHAPE_USES, type Shape } from "../geometry/plotShapes";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Dropzone from "../ui/Dropzone";
import FontPicker from "../ui/FontPicker";
import NumField from "../ui/NumField";
import Segmented from "../ui/Segmented";
import { errorText } from "../ui/Toast";
import { DESIGN_ACCEPT, fileToSvg, svgWidthMm } from "./designInput";
import DrawPad from "./DrawPad";
import MyLettersSheet from "./MyLetters";

const LETTERING = [["single", "Cursiva"], ["mine", "Minha letra"], ["font", "Contorno de uma fonte"]] as const;
const FILL_LABELS = [["outline", "Só contorno"], ["both", "Contorno + preencher"], ["fill", "Só preencher"]] as const;
const ANGLES = [["0", "0°"], ["45", "45°"], ["90", "90°"], ["135", "135°"]] as const;
export const MODEL_ACCEPT = ".3mf,.stl";

/** Lê um desenho ou imagem como SVG (com a largura do SVG, quando ele diz) ou uma peça 3D como contorno visto de cima. */
export async function readPlotFile(f: File): Promise<Partial<PlotItem>> {
  if (/\.(3mf|stl)$/i.test(f.name)) return { kind: "model", model: { name: f.name.replace(/\.[^.]+$/, ""), lines: await modelOutline(new Uint8Array(await f.arrayBuffer()), f.name) } };
  const text = await fileToSvg(f);
  const w = f.name.toLowerCase().endsWith(".svg") ? svgWidthMm(text) : null;
  return { kind: "design", svg: { text, name: f.name.replace(/\.[^.]+$/, "") }, ...(w ? { w: Math.round(w) } : {}) };
}

/** Conteúdo e preenchimento da camada escolhida (#320). `set` muda só esta camada; `key` junta digitação no desfazer. */
export default function PlotItemEditor({ item, set, alphabet, saveAlphabet }: { item: PlotItem; set: (patch: Partial<PlotItem>, key: string) => void; alphabet: Alphabet; saveAlphabet: (a: Alphabet) => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lettersOpen, setLettersOpen] = useState(false);
  const fill = item.fill;
  const setFill = <K extends keyof Fill>(k: K) => (v: Fill[K]) => set({ fill: { ...fill, [k]: v } }, `fill.${k}`);
  const shape = item.shape ?? SHAPE_DEFAULT;
  const setShape = (p: Partial<Shape>) => set({ shape: { ...shape, ...p } }, "shape");
  const uses = SHAPE_USES[shape.kind];
  const lettering = item.lettering ?? "single";

  async function onFile(f: File) {
    setLoading(true);
    setError(null);
    try {
      set(await readPlotFile(f), "file");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {item.kind === "hand" && (
        <>
          <DrawPad strokes={item.hand ?? []} onChange={(v) => set({ hand: v }, "hand")} label="Quadro para desenhar à mão livre" size={300} />
          <div className="row">
            <Button disabled={!item.hand?.length} onClick={() => set({ hand: (item.hand ?? []).slice(0, -1) }, "hand")}>
              Desfazer traço
            </Button>
            <Button disabled={!item.hand?.length} onClick={() => set({ hand: [] }, "hand")}>
              Limpar
            </Button>
          </div>
          <p className="hint">Desenhe com o mouse, a caneta do tablet ou o dedo.</p>
        </>
      )}
      {(item.kind === "design" || item.kind === "model") && (
        <>
          <Dropzone
            accept={item.kind === "model" ? MODEL_ACCEPT : DESIGN_ACCEPT}
            label={item.kind === "model" ? (item.model?.name ? `Trocar a peça (${item.model.name})` : "Arraste a peça (.3mf ou .stl)") : item.svg ? `Trocar o desenho (${item.svg.name})` : "Arraste um SVG ou imagem"}
            hint={item.kind === "model" ? "A caneta desenha o contorno da peça vista de cima, como no Bambu Studio." : "Imagens são vetorizadas automaticamente; a caneta passa no contorno."}
            onFile={onFile}
            compact={item.kind === "model" ? !!item.model?.name : !!item.svg}
          />
          {loading && <Alert kind="info">Lendo o arquivo…</Alert>}
          {error && <Alert kind="error">{error}</Alert>}
        </>
      )}
      {item.kind === "shape" && (
        <>
          <label>
            Forma
            <select value={shape.kind} onChange={(e) => setShape({ kind: e.target.value as Shape["kind"] })}>
              {SHAPES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="grid two">
            {uses.n && <NumField label={uses.n[0]} value={shape.n} onChange={(v) => setShape({ n: v })} min={uses.n[1]} max={uses.n[2]} step={1} unit="" />}
            {uses.ratio && <NumField label="Altura ÷ largura" value={shape.ratio} onChange={(v) => setShape({ ratio: v })} min={0.1} max={10} step={0.1} unit="" hint="1 = tão alto quanto largo." />}
          </div>
        </>
      )}
      {item.kind === "text" && (
        <>
          <label>
            Texto
            <textarea rows={2} maxLength={200} value={item.text ?? ""} onChange={(e) => set({ text: e.target.value }, "text")} />
          </label>
          <Segmented label="Letra" value={lettering} options={LETTERING} onChange={(v) => set({ lettering: v }, "lettering")} full />
          {lettering === "single" && <p className="hint">Letra cursiva de uma linha só, como escrita à mão: a caneta passa uma vez em cada letra. Aceita acentos e ç.</p>}
          {lettering === "mine" && (
            <>
              <Button onClick={() => setLettersOpen(true)}>{Object.keys(alphabet).length ? "Desenhar mais letras" : "Desenhar a minha letra"}</Button>
              <NumField label="Variação entre as letras" value={item.variation ?? 0.5} onChange={(v) => set({ variation: v }, "variation")} min={0} max={1} step={0.1} unit="" hint="0 = todas alinhadas; 1 = cada letra sobe, desce e anda um pouco, como escrita de verdade." />
              <p className="hint">{Object.keys(alphabet).length} letras desenhadas; as que faltam saem na cursiva.</p>
              {lettersOpen && <MyLettersSheet alphabet={alphabet} onSave={saveAlphabet} onClose={() => setLettersOpen(false)} />}
            </>
          )}
          {lettering === "font" ? (
            <>
              <FontPicker value={item.font ?? "sacramento"} onChange={(v) => set({ font: v }, "font")} sample={item.text ?? ""} />
              <p className="hint">A caneta passa no contorno das letras; para letra cheia, use Preencher abaixo.</p>
            </>
          ) : (
            <div className="grid two">
              <NumField label="Espaço entre as letras" value={item.gap ?? 0} onChange={(v) => set({ gap: v }, "gap")} min={-5} max={20} step={0.5} unit="" hint="0 = normal; mais = letras mais separadas." />
              <NumField label="Espaço entre as linhas" value={item.lineK ?? 1} onChange={(v) => set({ lineK: v }, "lineK")} min={0.6} max={3} step={0.1} unit="×" hint="1 = normal; 2 = o dobro." />
            </div>
          )}
        </>
      )}
      <Segmented label="Preenchimento" value={fill.mode} options={FILL_LABELS} onChange={setFill("mode")} full />
      {fill.mode !== "outline" && (
        <div className="grid two">
          <NumField label="Espaço entre as linhas do preenchimento" value={fill.spacing} onChange={setFill("spacing")} min={0.2} max={5} step={0.1} hint="Menor = mais cheio (e mais demorado). Ponta de 0,5 mm: 0,5 a 0,7." />
          <div className="stack">
            <Segmented label="Ângulo" value={String(fill.angle)} options={ANGLES} onChange={(v) => setFill("angle")(Number(v) as Fill["angle"])} />
            <label className="check">
              <input type="checkbox" checked={fill.cross} onChange={(e) => setFill("cross")(e.target.checked)} /> Cruzado (mais tinta)
            </label>
          </div>
        </div>
      )}
    </>
  );
}
