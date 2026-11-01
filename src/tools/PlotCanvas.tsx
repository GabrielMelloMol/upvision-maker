import { useRef, type PointerEvent, type ReactNode } from "react";
import type { Area, Place, Stroke } from "../geometry/plotter";

type Pt = [number, number];
/** Um item já posto na mesa: os traços e a caixa (meio, metade da largura e da altura, giro). */
export type Placed = { id: string; label: string; strokes: Stroke[]; hw: number; hh: number; out: boolean } & Place;

const RULER = 12; // faixa das réguas, em mm da prévia
type Drag = { id: string; mode: "move" | "size" | "turn"; from: Pt; start: Place };

/**
 * Prévia da mesa (#320): grade de 10 mm, réguas, folha e área que a caneta alcança. Clique escolhe o item; arrastar
 * move, o canto muda o tamanho e a bolinha de cima gira. Teclado e leitor de tela usam os campos de lugar ao lado.
 */
export default function PlotCanvas({ bed, area, sheet, items, selected, onSelect, onPlace, faded, children }: {
  bed: { x: number; y: number };
  area: Area;
  sheet: Area | null;
  items: Placed[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onPlace: (id: string, p: Partial<Place>, key: string) => void;
  /** Durante a simulação os traços ficam claros e a caneta desenha por cima (`children`). */
  faded: boolean;
  children?: ReactNode;
}) {
  const g = useRef<SVGGElement>(null);
  const drag = useRef<Drag | null>(null);

  // ponto do mouse em mm da mesa (Y para cima)
  const at = (e: PointerEvent): Pt | null => {
    const m = g.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const begin = (e: PointerEvent, it: Placed, mode: Drag["mode"]) => {
    e.stopPropagation();
    onSelect(it.id);
    const p = at(e);
    if (!p) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: it.id, mode, from: p, start: { x: it.x, y: it.y, w: it.w, rot: it.rot } };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    const p = d && at(e);
    if (!d || !p) return;
    const s = d.start;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    if (d.mode === "move") onPlace(d.id, { x: r1(s.x + p[0] - d.from[0]), y: r1(s.y + p[1] - d.from[1]) }, `move:${d.id}`);
    else if (d.mode === "size") {
      const k = Math.hypot(p[0] - s.x, p[1] - s.y) / Math.max(0.1, Math.hypot(d.from[0] - s.x, d.from[1] - s.y));
      onPlace(d.id, { w: Math.max(2, r1(s.w * k)) }, `size:${d.id}`);
    } else {
      const deg = (Math.atan2(p[1] - s.y, p[0] - s.x) * 180) / Math.PI - 90; // a bolinha fica em cima (90°)
      onPlace(d.id, { rot: Math.round(((deg % 360) + 540) % 360) - 180 }, `turn:${d.id}`);
    }
  };
  const end = () => {
    drag.current = null;
  };

  const ticks = (n: number, step: number) => Array.from({ length: Math.floor(n / step) + 1 }, (_, i) => i * step);
  const sel = items.find((i) => i.id === selected);

  return (
    <svg
      className="plot-preview"
      viewBox={`${-RULER} ${-RULER} ${bed.x + RULER} ${bed.y + RULER}`}
      role="img"
      aria-label="Prévia do desenho na mesa"
      style={{ width: "100%", maxHeight: "65vh", background: "#f3f4f8", border: "1px solid var(--line, #ccc)", touchAction: "none" }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerDown={() => onSelect(null)}
    >
      {/* réguas em mm: X em cima, Y à esquerda (0 embaixo, como na impressora) */}
      <g aria-hidden fontSize={4} fill="#8a90a6" fontFamily="ui-monospace, monospace">
        {ticks(bed.x, 20).map((v) => (
          <text key={`x${v}`} x={v} y={-4} textAnchor="middle">
            {v}
          </text>
        ))}
        {ticks(bed.y, 20).map((v) => (
          <text key={`y${v}`} x={-2} y={bed.y - v + 1.5} textAnchor="end">
            {v}
          </text>
        ))}
      </g>
      {/* Y da impressora para cima, Y da tela para baixo */}
      <g ref={g} transform={`translate(0 ${bed.y}) scale(1 -1)`}>
        <rect width={bed.x} height={bed.y} fill="#f6f2e6" aria-hidden />
        <g aria-hidden stroke="#d9d3c0">
          {ticks(bed.x, 10).map((v) => (
            <line key={`gx${v}`} x1={v} x2={v} y1={0} y2={bed.y} strokeWidth={v % 50 ? 0.15 : 0.35} />
          ))}
          {ticks(bed.y, 10).map((v) => (
            <line key={`gy${v}`} y1={v} y2={v} x1={0} x2={bed.x} strokeWidth={v % 50 ? 0.15 : 0.35} />
          ))}
        </g>
        {/* faixas que a caneta não alcança (o bico sairia da mesa) */}
        <path d={`M0 0H${bed.x}V${bed.y}H0Z M${area.x0} ${area.y0}V${area.y1}H${area.x1}V${area.y0}Z`} fill="#c9cbd6" fillOpacity={0.6} fillRule="evenodd" aria-hidden />
        {/* folha maior que a mesa (A4 numa A1): mostra só a parte em cima da mesa, sem cobrir as réguas */}
        {sheet && <rect x={Math.max(0, sheet.x0)} y={Math.max(0, sheet.y0)} width={Math.min(bed.x, sheet.x1) - Math.max(0, sheet.x0)} height={Math.min(bed.y, sheet.y1) - Math.max(0, sheet.y0)} fill="#fff" fillOpacity={0.85} stroke="#9aa3c7" strokeWidth={0.6} aria-hidden />}
        {sheet && <path d={`M${(sheet.x0 + sheet.x1) / 2 - 4} ${(sheet.y0 + sheet.y1) / 2}h8M${(sheet.x0 + sheet.x1) / 2} ${(sheet.y0 + sheet.y1) / 2 - 4}v8`} stroke="#9aa3c7" strokeWidth={0.5} aria-hidden />}
        {items.map((it) => (
          <g key={it.id}>
            {it.strokes.map((st, i) => (
              <polyline key={i} points={st.map((p) => p.join(",")).join(" ")} fill="none" stroke={faded ? "#c9cde0" : it.out ? "#c62828" : "#0B1F66"} strokeWidth={0.4} strokeLinejoin="round" />
            ))}
            {/* caixa de pegar o item (transparente) */}
            <rect transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`} x={-it.hw} y={-it.hh} width={2 * it.hw} height={2 * it.hh} fill="transparent" style={{ cursor: "move" }} onPointerDown={(e) => begin(e, it, "move")}>
              <title>{it.label}</title>
            </rect>
          </g>
        ))}
        {sel && (
          <g transform={`translate(${sel.x} ${sel.y}) rotate(${sel.rot})`}>
            <rect x={-sel.hw} y={-sel.hh} width={2 * sel.hw} height={2 * sel.hh} fill="none" stroke={sel.out ? "#c62828" : "#F85A00"} strokeWidth={0.5} strokeDasharray="2 1.5" pointerEvents="none" />
            <line x1={0} y1={sel.hh} x2={0} y2={sel.hh + 8} stroke="#F85A00" strokeWidth={0.5} pointerEvents="none" />
            <circle cx={0} cy={sel.hh + 8} r={2.4} fill="#fff" stroke="#F85A00" strokeWidth={0.6} style={{ cursor: "grab" }} onPointerDown={(e) => begin(e, sel, "turn")}>
              <title>Girar</title>
            </circle>
            <rect x={sel.hw - 2.2} y={-sel.hh - 2.2} width={4.4} height={4.4} fill="#F85A00" style={{ cursor: "nwse-resize" }} onPointerDown={(e) => begin(e, sel, "size")}>
              <title>Mudar o tamanho</title>
            </rect>
          </g>
        )}
        {children}
      </g>
    </svg>
  );
}
