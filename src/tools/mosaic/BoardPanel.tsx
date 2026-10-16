import { boardSize, pieceSide, type JoinKind } from "../../geometry/mosaic/params";
import { boardsNeeded } from "../../geometry/mosaic/kit";
import ColorPick from "../ColorPick";
import NumField from "../../ui/NumField";
import Segmented from "../../ui/Segmented";
import type { State } from "./state";
import type { Tool } from "./tool";

const JOINS = [["none", "Sem encaixe"], ["dovetail", "Cauda de andorinha"]] as const;
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Aba Tabuleiro: tamanho da grade, casas rebaixadas, folga da peça e encaixe entre tabuleiros. */
export default function BoardPanel({ tool }: { tool: Tool }) {
  const s = tool.state;
  const b = s.board;
  const setB = <K extends keyof State["board"]>(k: K) => (v: State["board"][K]) => tool.set((cur) => ({ ...cur, board: { ...cur.board, [k]: v } }), `board.${String(k)}`);
  const [W, H] = boardSize(b);
  const [bx, by] = boardsNeeded(s);
  return (
    <div className="stack">
      <div className="card stack">
        <h3>Grade</h3>
        <div className="grid two">
          <NumField label="Colunas" value={b.cols} onChange={setB("cols")} min={2} max={16} step={1} unit="" />
          <NumField label="Linhas" value={b.rows} onChange={setB("rows")} min={2} max={16} step={1} unit="" />
          <NumField label="Tamanho da casa" value={b.cell} onChange={setB("cell")} min={12} max={40} step={1} hint="Distância entre os centros de duas casas." />
          <NumField label="Folga da peça" value={b.clearance} onChange={setB("clearance")} min={0.1} max={0.6} step={0.05} hint="De cada lado. 0,25 entra justo; aumente se a peça prender." />
        </div>
        <span className="hint">
          O tabuleiro mede {fmt(W)} × {fmt(H)} mm e a peça quadrada, {fmt(pieceSide(b))} mm.
          {bx * by > 1 && ` O desenho atual pede ${bx} × ${by} tabuleiros.`}
        </span>
      </div>
      <div className="card stack">
        <h3>Encaixe entre tabuleiros</h3>
        <Segmented label="Encaixe entre tabuleiros" value={b.join} options={JOINS} onChange={(v: JoinKind) => setB("join")(v)} full />
        <span className="hint">{b.join === "dovetail" ? "Caudas à direita e embaixo, vãos à esquerda e em cima: o tabuleiro desce sobre o vizinho e forma um painel maior." : "Cada tabuleiro fica sozinho."}</span>
        <ColorPick label="Cor do tabuleiro" value={b.color} onChange={setB("color")} />
      </div>
      <details className="advanced">
        <summary>Opções avançadas</summary>
        <div className="grid two">
          <NumField label="Parede entre as casas" value={b.rib} onChange={setB("rib")} min={1} max={3} step={0.1} />
          <NumField label="Profundidade da casa" value={b.depth} onChange={setB("depth")} min={1.2} max={4} step={0.1} />
          <NumField label="Fundo da casa" value={b.floor} onChange={setB("floor")} min={0.8} max={3} step={0.1} />
          <NumField label="Borda em volta" value={b.border} onChange={setB("border")} min={2} max={15} step={0.5} hint="O encaixe pede pelo menos 6 mm." />
        </div>
      </details>
    </div>
  );
}
