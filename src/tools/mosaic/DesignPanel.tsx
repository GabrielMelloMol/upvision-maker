import { useState } from "react";
import { DESIGNS } from "../../geometry/mosaic/designs";
import { blankGrid, countCells, gridFromImage, partsOf, type CornerStyle } from "../../geometry/mosaic/grid";
import { kitColors, boardsNeeded } from "../../geometry/mosaic/kit";
import { SHAPE_LABEL } from "../../geometry/mosaic/shapes";
import { MAX_SIZE, MIN_SIZE } from "../../geometry/pixelArt";
import Alert from "../../ui/Alert";
import Dropzone from "../../ui/Dropzone";
import NumField, { inRange } from "../../ui/NumField";
import Segmented from "../../ui/Segmented";
import Toggle from "../../ui/Toggle";
import { IMAGE_ACCEPT, loadRaster } from "../../vectorize/client";
import { BrushBar, type Brush } from "./MosaicEditor";
import type { State } from "./state";
import type { Tool } from "./tool";

const CORNERS = [["none", "Só quadrados"], ["quarter", "Cantos redondos"], ["triangle", "Cantos em diagonal"]] as const;

/** Aba Desenho: pintar a grade, escolher um cartão pronto ou converter uma imagem em mosaico. */
export default function DesignPanel({ tool, brush, setBrush }: { tool: Tool; brush: Brush; setBrush: (b: Brush) => void }) {
  const s = tool.state;
  const all = kitColors(s);
  const usable = kitColors(s, true);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const parts = partsOf(s.grid, all);
  const [bx, by] = boardsNeeded(s);
  const imageOk = inRange(s.imageSize, MIN_SIZE, 24);

  const setGrid = (grid: State["grid"], designName = s.designName) => tool.set((cur) => ({ ...cur, grid, designName }), "grid");

  async function fromImage(f: File) {
    setError(null);
    setConverting(true);
    try {
      const r = await loadRaster(f, (w, h) => Math.min(1, (MAX_SIZE * 8) / Math.max(w, h)));
      URL.revokeObjectURL(r.url);
      if (usable.length < 2) throw new Error("Ligue pelo menos duas cores na aba Peças para converter a imagem.");
      setGrid(gridFromImage(r.rgba, r.w, r.h, s.imageSize, usable, s.corners, s.dropBackground), f.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui ler a imagem.");
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h3>Cartões prontos</h3>
        <div className="chips" role="group" aria-label="Cartões prontos">
          {DESIGNS.map((d) => (
            <button key={d.id} type="button" aria-pressed={s.designName === d.name} onClick={() => setGrid(structuredClone(d.grid), d.name)}>
              {d.name}
            </button>
          ))}
        </div>
        <div className="row">
          <button type="button" className="ghost" onClick={() => setGrid(blankGrid(s.board.cols, s.board.rows), "")}>
            Começar em branco ({s.board.cols} × {s.board.rows})
          </button>
        </div>
        <span className="hint">Escolher um cartão troca o desenho atual (dá para desfazer).</span>
      </div>
      <div className="card stack">
        <h3>Imagem para mosaico</h3>
        <Dropzone accept={IMAGE_ACCEPT} label={converting ? "Convertendo…" : "Envie uma foto ou desenho"} hint="Desenhos simples, com poucas cores, ficam melhores." onFile={(f) => void fromImage(f)} />
        <div className="grid two">
          <NumField label="Casas no lado maior" value={s.imageSize} onChange={(n) => tool.set((cur) => ({ ...cur, imageSize: n }), "imageSize")} min={MIN_SIZE} max={24} step={1} unit="" hint="Só as cores ligadas na aba Peças são usadas." />
        </div>
        <Toggle label="Ignorar o fundo" checked={s.dropBackground} onChange={(v) => tool.set((cur) => ({ ...cur, dropBackground: v }), "dropBackground")} />
        <Segmented label="Formato nos cantos" value={s.corners} options={CORNERS} onChange={(v: CornerStyle) => tool.set((cur) => ({ ...cur, corners: v }), "corners")} full />
        {!imageOk && <Alert kind="warn">Use de {MIN_SIZE} a 24 casas.</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
      </div>
      <div className="card stack">
        <h3>Pincel</h3>
        <BrushBar colors={usable} brush={brush} onChange={setBrush} />
      </div>
      {parts.length > 0 && (
        <div className="card stack" aria-label="Peças do desenho">
          <h3>
            Peças do desenho: {countCells(s.grid)}
            {s.designName && ` · ${s.designName}`}
          </h3>
          <ul className="mosaic-parts">
            {parts.map((p) => (
              <li key={`${p.color.key}${p.shape}`}>
                <span className="swatch-inline">
                  <i style={{ background: p.color.hex }} />
                  {p.n} × {p.shape === "eye" ? "olho" : p.color.label.toLowerCase()} {p.shape !== "eye" && SHAPE_LABEL[p.shape].toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
          {bx * by > 1 && <Alert kind="info">O desenho pede {bx * by} tabuleiros de {s.board.cols} × {s.board.rows} ({bx} × {by}). Use o encaixe entre tabuleiros para montar o painel.</Alert>}
        </div>
      )}
    </div>
  );
}

