import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { GRID, type DrawerPlan } from "../../geometry/models/gridDrawer";
import { footprint, type BinPlace, type BinSize } from "../../geometry/models/toolFitDrawer";

type Props = {
  plan: DrawerPlan;
  sizes: BinSize[];
  places: Record<string, BinPlace>;
  /** Número e nome de cada ferramenta (o mesmo da lista e da foto). */
  names: Record<string, { num: number; label: string }>;
  onMove: (id: string, dx: number, dy: number) => void;
};

const NUM_R = 9;
const FRONT_H = 14; // mm de desenho embaixo da gaveta para o rótulo "Frente"
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const INSET = 1.5; // mm: vão entre caixinhas vizinhas no desenho

/**
 * Mapa da gaveta modular (#169), visto de cima com a frente embaixo: grade de 42 mm, cada caixinha com o número da
 * ferramenta e as casas livres. Arrastar ou setas movem a caixinha casa a casa (se bater, não move).
 */
export default function DrawerMap({ plan, sizes, places, names, onMove }: Props) {
  const [drag, setDrag] = useState<{ id: string; from: [number, number] } | null>(null);
  const W = plan.nx * GRID + plan.marginX[0] + plan.marginX[1];
  const D = plan.ny * GRID + plan.marginY[0] + plan.marginY[1];
  const ox = plan.marginX[0], oy = plan.marginY[0];
  const sx = (c: number) => ox + c * GRID;
  const sy = (r: number) => D - oy - r * GRID; // fileira (da frente) → mm do topo do desenho
  const placed = sizes.filter((s) => places[s.id]);
  const used = placed.reduce((a, s) => a + s.w * s.h, 0);
  const free = plan.nx * plan.ny - used;

  function cellAt(e: PointerEvent): [number, number] {
    const el = e.currentTarget as SVGElement;
    const m = (el instanceof SVGSVGElement ? el : el.ownerSVGElement)?.getScreenCTM?.();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [Math.floor((p.x - ox) / GRID), Math.floor((D - oy - p.y) / GRID)];
  }
  function up(e: PointerEvent) {
    if (!drag) return;
    const [c, r] = cellAt(e);
    const [dx, dy] = [c - drag.from[0], r - drag.from[1]];
    setDrag(null);
    if (dx || dy) onMove(drag.id, dx, dy);
  }
  const keys: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  function key(id: string, e: KeyboardEvent) {
    const d = keys[e.key];
    if (!d) return;
    e.preventDefault();
    onMove(id, d[0], d[1]);
  }

  const desc = `Gaveta com ${plan.nx} × ${plan.ny} casas de 42 mm, frente embaixo; ${plural(placed.length, "caixinha", "caixinhas")}; ${plural(free, "casa livre", "casas livres")}.`;
  return (
    <figure className="card stack drawer-map" style={{ margin: 0 }}>
      <h3>Mapa da gaveta</h3>
      <svg className="drawer-editor" viewBox={`-2 -2 ${W + 4} ${D + 4 + FRONT_H}`} role="img" aria-label={desc} onPointerMove={(e) => drag && e.preventDefault()} onPointerUp={up}>
        <rect className="drawer-base" x={0} y={0} width={W} height={D} rx={4} />
        {Array.from({ length: plan.nx * plan.ny }, (_, i) => (
          <rect key={i} className="drawer-cell" x={sx(i % plan.nx)} y={sy(Math.floor(i / plan.nx) + 1)} width={GRID} height={GRID} />
        ))}
        {/* a frente da gaveta (perto de quem abre) fica embaixo: o rótulo evita montar invertido */}
        <text className="drawer-front" x={W / 2} y={D + FRONT_H * 0.75} textAnchor="middle" fontSize={FRONT_H * 0.7} fill="var(--muted)">
          Frente
        </text>
        {placed.map((s) => {
          const r = footprint(s, places[s.id]);
          const n = names[s.id];
          const [x, y, w, h] = [sx(r.x) + INSET, sy(r.y + r.h) + INSET, r.w * GRID - 2 * INSET, r.h * GRID - 2 * INSET];
          return (
            <g
              key={s.id}
              className="drawer-module"
              tabIndex={0}
              role="button"
              aria-label={`Caixinha ${n?.num ?? ""} ${n?.label ?? ""}, ${r.w}×${r.h} casas, coluna ${r.x + 1}, fileira ${r.y + 1} (setas movem)`}
              data-selected={drag?.id === s.id || undefined}
              onPointerDown={(e) => {
                (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                setDrag({ id: s.id, from: cellAt(e) });
              }}
              onKeyDown={(e) => key(s.id, e)}
            >
              <rect x={x} y={y} width={w} height={h} rx={3} fill="var(--accent-soft)" />
              <g className="tool-num" transform={`translate(${x + w / 2} ${y + h / 2})`}>
                <circle r={NUM_R} />
                <text fontSize={NUM_R * 1.2} dy="0.35em">
                  {n?.num}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      <p className="hint">
        {free > 0 ? `${plural(free, "casa livre", "casas livres")} de ${plan.nx * plan.ny}.` : "Gaveta cheia."} Arraste uma caixinha (ou use as setas) para mudar de lugar.
      </p>
    </figure>
  );
}
