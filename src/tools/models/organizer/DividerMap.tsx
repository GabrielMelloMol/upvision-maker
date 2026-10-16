import { useState } from "react";
import Alert from "../../../ui/Alert";
import { cellsOf, layoutProblem, MIN_CELL, smallestSide, stripsOf, type Cell } from "../../../geometry/models/organizer/layout";
import { dimsOf, type OrganizerParams } from "../../../geometry/models/organizer/params";
import type { Params } from "../fields";

const br = (n: number) => (Math.round(n * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const measure = (c: Cell) => `${br(c.x1 - c.x0)} × ${br(c.y1 - c.y0)} mm`;
const isSmall = (c: Cell) => Math.min(c.x1 - c.x0, c.y1 - c.y0) < MIN_CELL;

/** Resumo para o leitor de tela: "5 × 4 nichos, o menor com 25 mm" (faixas diferentes: total de nichos e de faixas). */
function summary(counts: number[], smallest: number): string {
  const shape = counts.every((n) => n === counts[0]) ? `${counts[0]} × ${counts.length} nichos` : `${counts.reduce((a, n) => a + n, 0)} nichos em ${counts.length} faixas`;
  return `Mapa das divisórias: ${shape}, o menor com ${Math.round(smallest)} mm`;
}

/** Mapa 2D ao vivo da divisão da caixa organizadora: a frente fica embaixo, como no editor de gaveta. */
export default function DividerMap({ label, params }: { label: string; params: Params }) {
  const p = params as unknown as OrganizerParams;
  const [shown, setShown] = useState<string | null>(null);
  const { outerW, outerD, innerW, innerD } = dimsOf(p);
  if (!(innerW > 0 && innerD > 0) || !(p.divider >= 0)) return null;
  const strips = stripsOf(p);
  const rows = cellsOf(strips, innerW, innerD, p.divider);
  const problem = layoutProblem(p, innerW, innerD, p.divider);
  const pick = (id: string | null) => () => setShown(id);
  return (
    <div className="divider-map span-2">
      <span className="field-label">{label}</span>
      <svg viewBox={`0 0 ${outerW} ${outerD}`} role="group" aria-label={summary(strips.map((s) => s.n), smallestSide(rows))} className="divider-map-svg">
        <rect className="divider-map-wall" x={0} y={0} width={outerW} height={outerD} rx={p.outerRadius} />
        {rows.map((row, r) =>
          row.map((c, i) => {
            const id = `${r}-${i}`;
            const w = c.x1 - c.x0, h = c.y1 - c.y0;
            return (
              <rect key={id} className="divider-map-cell" data-small={isSmall(c) || undefined} data-active={shown === id || undefined} tabIndex={0} aria-label={`Nicho ${measure(c)}`}
                x={outerW / 2 + c.x0} y={outerD / 2 - c.y1} width={w} height={h} rx={Math.min(p.cellRadius, w / 2, h / 2)}
                onMouseEnter={pick(id)} onMouseLeave={pick(null)} onFocus={pick(id)} onBlur={pick(null)}>
                <title>{measure(c)}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <p className="hint divider-map-read" aria-live="polite">
        {(() => {
          const [r, i] = (shown ?? "").split("-").map(Number);
          const c = shown ? rows[r]?.[i] : undefined;
          return c ? `Nicho: ${measure(c)} úteis` : "Passe o mouse ou foque um nicho para ver a medida útil.";
        })()}
      </p>
      {problem && <Alert kind="error">{problem}</Alert>}
    </div>
  );
}
