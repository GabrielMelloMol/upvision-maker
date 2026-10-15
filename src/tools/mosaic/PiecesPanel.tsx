import { KIT_COLORS } from "../../geometry/mosaic/grid";
import { totalPieces, type PieceSource } from "../../geometry/mosaic/kit";
import { pieceItemsOf, kitColors } from "../../geometry/mosaic/kit";
import { fullPlateCounts, plateCapacity, type PlateLayout } from "../../geometry/mosaic/pieces";
import { SHAPES, type MosaicShape } from "../../geometry/mosaic/shapes";
import NumField from "../../ui/NumField";
import Segmented from "../../ui/Segmented";
import Toggle from "../../ui/Toggle";
import ColorPick from "../ColorPick";
import { ShapeIcon } from "./MosaicEditor";
import type { Tool } from "./tool";

const SOURCES = [["manual", "Quantidade por cor"], ["design", "Só as do desenho"]] as const;
const LAYOUTS = [["color", "Uma cor por mesa"], ["mixed", "Multicor (AMS)"]] as const;

/** Aba Peças: cores do kit, formatos, quantidade, e como as peças se distribuem nas mesas. */
export default function PiecesPanel({ tool, platesN, extra }: { tool: Tool; platesN: number; extra: number }) {
  const s = tool.state;
  const colors = kitColors(s);
  const items = pieceItemsOf(s);
  const cap = plateCapacity(s.board).total;
  const setCount = (shape: MosaicShape) => (n: number) => tool.set((cur) => ({ ...cur, counts: { ...cur.counts, [shape]: n } }), `count.${shape}`);
  const setKit = (key: string, patch: Partial<{ on: boolean; hex: string }>) => tool.set((cur) => ({ ...cur, kit: { ...cur.kit, [key]: { ...cur.kit[key], ...patch } } }), `kit.${key}`);
  const perColor = Object.entries(s.counts).filter(([k]) => k !== "eye").reduce((n, [, v]) => n + v, 0);
  return (
    <div className="stack">
      <div className="card stack">
        <h3>Cores do kit</h3>
        <ul className="mosaic-colors" aria-label="Cores do kit">
          {KIT_COLORS.map((k) => (
            <li key={k.key}>
              <Toggle label={colors.find((c) => c.key === k.key)?.label ?? k.label} checked={s.kit[k.key].on} onChange={(on) => setKit(k.key, { on })} />
              {s.kit[k.key].on && <ColorPick label={`Filamento ${k.label.toLowerCase()}`} value={s.kit[k.key].hex} onChange={(hex) => setKit(k.key, { hex })} />}
            </li>
          ))}
        </ul>
        <span className="hint">Cada cor ligada ganha uma divisória no pote. O olho é sempre branco, com a pupila preta.</span>
      </div>
      <div className="card stack">
        <h3>Quantidade</h3>
        <Segmented label="Quantas peças" value={s.source} options={SOURCES} onChange={(v: PieceSource) => tool.set((cur) => ({ ...cur, source: v }), "source")} full />
        {s.source === "design" ? (
          <>
            <NumField label="Sobra" value={s.spare} onChange={(n) => tool.set((cur) => ({ ...cur, spare: n }), "spare")} min={0} max={100} step={5} unit="%" hint="Peças a mais para o que some." />
            <span className="hint">{s.grid.cells.some(Boolean) ? "Imprime só as peças do desenho da aba Desenho, mais a sobra." : "O desenho está vazio: pinte ou escolha um na aba Desenho."}</span>
          </>
        ) : (
          <>
            <span className="hint">Quantas peças de cada formato, em cada cor ligada. Zero desliga o formato.</span>
            <div className="mosaic-counts">
              {SHAPES.map((sh) => (
                <div key={sh.id} className="mosaic-count">
                  <ShapeIcon shape={sh.id} size={22} />
                  <NumField label={sh.id === "eye" ? "Olhos (brancos)" : sh.label} value={s.counts[sh.id]} onChange={setCount(sh.id)} min={0} max={400} step={1} unit="" />
                </div>
              ))}
            </div>
            <div className="row">
              <button type="button" className="ghost" onClick={() => tool.set((cur) => ({ ...cur, counts: fullPlateCounts(cap, cur.counts.eye) }), "counts")}>
                Encher uma mesa por cor ({cap} peças)
              </button>
            </div>
            <span className="hint">{perColor} peças em cada cor, mais {s.counts.eye} olhos.</span>
          </>
        )}
      </div>
      <div className="card stack">
        <h3>Mesas</h3>
        <Segmented label="Como as peças vão para a mesa" value={s.layout} options={LAYOUTS} onChange={(v: PlateLayout) => tool.set((cur) => ({ ...cur, layout: v }), "layout")} full />
        <span className="hint">
          {s.layout === "color" ? "Cada mesa tem uma cor só: imprima uma cor por vez, sem AMS." : "As cores se misturam na mesma mesa: pede AMS (ou troca de filamento)."} Cabem {cap} peças por mesa.
        </span>
        <Toggle label="Completar a última mesa com quadrados" checked={s.fill} onChange={(v) => tool.set((cur) => ({ ...cur, fill: v }), "fill")} />
        <span className="hint">
          {totalPieces(items)} peças em {platesN} {platesN === 1 ? "mesa" : "mesas"}
          {extra > 0 && `, ${extra} extras para completar`}.
        </span>
      </div>
    </div>
  );
}
