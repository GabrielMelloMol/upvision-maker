import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import Button from "../ui/Button";
import type { Area, Place, Stroke } from "../geometry/plotter";

type Pt = [number, number];
/** Um item já posto na mesa: os traços e a caixa (meio, metade da largura e da altura, giro). */
/** `ghost` = camada nova ainda não adicionada (#322): aparece mais clara. */
export type Placed = { id: string; label: string; strokes: Stroke[]; hw: number; hh: number; out: boolean; ghost?: boolean } & Place;

const RULER = 12; // faixa das réguas, em mm da prévia
type Drag = { id: string; mode: "move" | "size" | "turn"; from: Pt; start: Place } | { mode: "pan"; client: Pt; view: View };
type View = { x: number; y: number; w: number; h: number };
const MAX_ZOOM = 12;
const STEP = 1.25;

/**
 * Prévia da mesa (#320): grade de 10 mm, réguas, folha e área que a caneta alcança. Clique escolhe o item; arrastar
 * move, o canto muda o tamanho e a bolinha de cima gira. Teclado e leitor de tela usam os campos de lugar ao lado.
 * Zoom (#322): rolagem do mouse (no ponto do mouse) ou os botões; com zoom, arrastar o fundo move a vista.
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
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const full: View = { x: -RULER, y: -RULER, w: bed.x + RULER, h: bed.y + RULER };
  const [zoomed, setView] = useState<View | null>(null);
  // mesa trocada (outra impressora): volta a ver tudo
  const view = zoomed && zoomed.w <= full.w && zoomed.h <= full.h ? zoomed : full;
  const k = view.w / full.w; // alças do mesmo tamanho na tela com qualquer zoom

  /** Zoom em volta do ponto `p` (mm da prévia), mantendo-o no mesmo lugar da tela; a vista não sai da mesa. */
  const zoomAt = (cur: View, factor: number, p: Pt): View | null => {
    const w = Math.min(full.w, Math.max(full.w / MAX_ZOOM, cur.w / factor));
    if (w >= full.w - 1e-6) return null;
    const r = w / cur.w;
    const h = cur.h * r;
    const clamp = (v: number, lo: number, size: number, total: number) => Math.min(lo + total - size, Math.max(lo, v));
    return { x: clamp(p[0] - (p[0] - cur.x) * r, full.x, w, full.w), y: clamp(p[1] - (p[1] - cur.y) * r, full.y, h, full.h), w, h };
  };
  const zoomButton = (factor: number) => setView((cur) => zoomAt(cur ?? full, factor, [(cur ?? full).x + (cur ?? full).w / 2, (cur ?? full).y + (cur ?? full).h / 2]));

  // rolagem: precisa de listener não passivo para não rolar a página junto
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const m = el.getScreenCTM();
      if (!m) return;
      e.preventDefault();
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      setView((cur) => zoomAt(cur ?? full, e.deltaY < 0 ? STEP : 1 / STEP, [p.x, p.y]));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- full depende só do tamanho da mesa
  }, [bed.x, bed.y]);

  // ponto do mouse em mm da mesa (Y para cima)
  const at = (e: PointerEvent): Pt | null => {
    const m = g.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const begin = (e: PointerEvent, it: Placed, mode: "move" | "size" | "turn") => {
    e.stopPropagation();
    onSelect(it.id);
    const p = at(e);
    if (!p) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: it.id, mode, from: p, start: { x: it.x, y: it.y, w: it.w, rot: it.rot } };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (d?.mode === "pan") {
      const rect = svg.current?.getBoundingClientRect();
      if (!rect?.width) return;
      const per = d.view.w / rect.width; // mm da prévia por pixel
      const clamp = (v: number, lo: number, size: number, total: number) => Math.min(lo + total - size, Math.max(lo, v));
      setView({ ...d.view, x: clamp(d.view.x - (e.clientX - d.client[0]) * per, full.x, d.view.w, full.w), y: clamp(d.view.y - (e.clientY - d.client[1]) * per, full.y, d.view.h, full.h) });
      return;
    }
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
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ alignItems: "center", gap: 6 }}>
        <Button size="sm" icon={ZoomOut} aria-label="Diminuir o zoom" disabled={!zoomed} onClick={() => zoomButton(1 / STEP)} />
        <Button size="sm" icon={ZoomIn} aria-label="Aumentar o zoom" disabled={view.w <= full.w / MAX_ZOOM + 1e-6} onClick={() => zoomButton(STEP)} />
        <Button size="sm" icon={Maximize} disabled={!zoomed} onClick={() => setView(null)}>
          Tirar o zoom
        </Button>
        <span className="hint" aria-live="polite">
          {Math.round((full.w / view.w) * 100)}% · role o mouse para dar zoom{zoomed ? "; arraste o fundo para mover a vista" : ""}
        </span>
      </div>
      <svg
        ref={svg}
        className="plot-preview"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="img"
        aria-label="Prévia do desenho na mesa"
        style={{ width: "100%", maxHeight: "65vh", background: "#f3f4f8", border: "1px solid var(--line, #ccc)", touchAction: "none" }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerDown={(e) => {
          onSelect(null);
          if (!zoomed) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          drag.current = { mode: "pan", client: [e.clientX, e.clientY], view: zoomed };
        }}
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
            <g key={it.id} opacity={it.ghost ? 0.6 : 1}>
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
              <rect x={-sel.hw} y={-sel.hh} width={2 * sel.hw} height={2 * sel.hh} fill="none" stroke={sel.out ? "#c62828" : "#F85A00"} strokeWidth={0.5 * k} strokeDasharray={`${2 * k} ${1.5 * k}`} pointerEvents="none" />
              <line x1={0} y1={sel.hh} x2={0} y2={sel.hh + 8 * k} stroke="#F85A00" strokeWidth={0.5 * k} pointerEvents="none" />
              <circle cx={0} cy={sel.hh + 8 * k} r={2.4 * k} fill="#fff" stroke="#F85A00" strokeWidth={0.6 * k} style={{ cursor: "grab" }} onPointerDown={(e) => begin(e, sel, "turn")}>
                <title>Girar</title>
              </circle>
              <rect x={sel.hw - 2.2 * k} y={-sel.hh - 2.2 * k} width={4.4 * k} height={4.4 * k} fill="#F85A00" style={{ cursor: "nwse-resize" }} onPointerDown={(e) => begin(e, sel, "size")}>
                <title>Mudar o tamanho</title>
              </rect>
            </g>
          )}
          {children}
        </g>
      </svg>
    </div>
  );
}
