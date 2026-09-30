import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { GRID, type DrawerPlan } from "../../geometry/models/gridDrawer";
import { addModule, canPlace, duplicate, moveModules, removeModules, resizeModule, type DrawerLayout, type DrawerModule, type Rect } from "./layout";

type Props = {
  layout: DrawerLayout;
  plan: DrawerPlan;
  selected: string[];
  onChange: (l: DrawerLayout) => void;
  onSelect: (ids: string[]) => void;
};

const HANDLE_PX = 8;
const TOUCH_PX = 24;
const INSET = 1.5; // mm: vão entre caixinhas vizinhas no desenho (a de verdade tem 0,5 mm de folga)
type Drag =
  | { kind: "draw"; from: [number, number]; to: [number, number] }
  | { kind: "move"; from: [number, number]; base: DrawerLayout; dx: number; dy: number }
  | { kind: "resize"; id: string; anchor: [number, number]; base: DrawerLayout };

const rectOf = (a: [number, number], b: [number, number]): Rect => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]) + 1, h: Math.abs(a[1] - b[1]) + 1 });
const hits = (m: Rect, r: Rect) => m.x < r.x + r.w && r.x < m.x + m.w && m.y < r.y + r.h && r.y < m.y + m.h;
const label = (m: DrawerModule) => `Caixinha ${m.w}×${m.h}, altura ${m.u}, coluna ${m.x + 1}, fileira ${m.y + 1}${m.label.trim() ? `, etiqueta ${m.label.trim()}` : ""}`;

/**
 * Editor 2D da gaveta (#140), em mm e visto de cima (a frente embaixo). Arrastar no vazio cria um módulo; se o
 * retângulo pega módulos, seleciona. Clique seleciona (Shift/⌘ junta), arrastar move, alças redimensionam.
 * Teclado: setas movem, Shift+setas redimensionam, Delete apaga, ⌘D duplica, Esc limpa a seleção.
 */
export default function DrawerEditor({ layout, plan, selected, onChange, onSelect }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pxPerMm, setPxPerMm] = useState(1);
  const W = plan.nx * GRID + plan.marginX[0] + plan.marginX[1];
  const D = plan.ny * GRID + plan.marginY[0] + plan.marginY[1];
  const ox = plan.marginX[0], oy = plan.marginY[0];
  // mm na tela: alças de 8 px e alvo de toque de 24 px, qualquer que seja o zoom
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setPxPerMm(el.getBoundingClientRect().width / W || 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [W]);
  const sx = (c: number) => ox + c * GRID; // coluna → mm
  const sy = (r: number) => D - oy - r * GRID; // fileira (da frente) → mm do topo do desenho

  function cellAt(e: PointerEvent): [number, number] {
    const el = e.currentTarget as SVGElement;
    const root = el instanceof SVGSVGElement ? el : el.ownerSVGElement;
    const m = root?.getScreenCTM?.();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const c = Math.floor((p.x - ox) / GRID), r = Math.floor((D - oy - p.y) / GRID);
    return [Math.min(layout.cols - 1, Math.max(0, c)), Math.min(layout.rows - 1, Math.max(0, r))];
  }

  function down(e: PointerEvent, target?: DrawerModule, handle?: [number, number]) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const at = cellAt(e);
    if (target && handle) {
      onSelect([target.id]);
      setDrag({ kind: "resize", id: target.id, anchor: handle, base: layout });
    } else if (target) {
      const multi = e.shiftKey || e.metaKey || e.ctrlKey;
      const next = multi ? (selected.includes(target.id) ? selected.filter((x) => x !== target.id) : [...selected, target.id]) : selected.includes(target.id) ? selected : [target.id];
      onSelect(next);
      setDrag({ kind: "move", from: at, base: layout, dx: 0, dy: 0 });
    } else setDrag({ kind: "draw", from: at, to: at });
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    const at = cellAt(e);
    if (drag.kind === "draw") setDrag({ ...drag, to: at });
    else if (drag.kind === "move") {
      const dx = at[0] - drag.from[0], dy = at[1] - drag.from[1];
      if (dx === drag.dx && dy === drag.dy) return;
      const next = moveModules(drag.base, selected, dx, dy);
      if (next !== drag.base) onChange(next);
      setDrag({ ...drag, dx, dy });
    } else {
      const r = rectOf(drag.anchor, at);
      const m = drag.base.modules.find((x) => x.id === drag.id)!;
      const moved = { ...drag.base, modules: drag.base.modules.map((x) => (x.id === m.id ? { ...x, x: r.x, y: r.y } : x)) };
      const next = canPlace(drag.base, r, [m.id]) ? resizeModule(moved, m.id, r.w, r.h) : drag.base;
      if (next !== drag.base) onChange(next);
    }
  }

  function up() {
    if (drag?.kind === "draw") {
      const r = rectOf(drag.from, drag.to);
      const caught = layout.modules.filter((m) => hits(m, r)).map((m) => m.id);
      if (caught.length) onSelect(caught);
      else {
        const next = addModule(layout, r, plan.uMax);
        if (next) {
          onChange(next);
          onSelect([next.modules[next.modules.length - 1].id]);
        }
      }
    }
    setDrag(null);
  }

  function key(e: KeyboardEvent, m: DrawerModule) {
    const ids = selected.includes(m.id) ? selected : [m.id];
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const a = arrows[e.key];
    if (a) {
      e.preventDefault();
      onChange(e.shiftKey ? resizeModule(layout, m.id, m.w + a[0], m.h + a[1]) : moveModules(layout, ids, a[0], a[1]));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onChange(removeModules(layout, ids));
      onSelect([]);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      onChange(duplicate(layout, ids));
    } else if (e.key === "Escape") onSelect([]);
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onSelect(ids.includes(m.id) && selected.length ? ids : [m.id]);
    }
  }

  const drawRect = drag?.kind === "draw" ? rectOf(drag.from, drag.to) : null;
  const seamsX = plan.piecesX.slice(0, -1).map((_, i) => plan.piecesX.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const seamsY = plan.piecesY.slice(0, -1).map((_, i) => plan.piecesY.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const h = HANDLE_PX / pxPerMm, t = TOUCH_PX / pxPerMm;

  return (
    <svg
      ref={svg}
      className="drawer-editor"
      viewBox={`0 0 ${W} ${D}`}
      role="group"
      aria-label={`Gaveta com ${layout.cols} × ${layout.rows} casas. Arraste no vazio para criar uma caixinha; use as setas numa caixinha para mover e Shift + setas para mudar o tamanho.`}
      onPointerDown={(e) => {
        if (!(e.shiftKey || e.metaKey || e.ctrlKey)) onSelect([]);
        down(e);
      }}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
    >
      <rect className="drawer-base" x={0} y={0} width={W} height={D} rx={4} />
      {Array.from({ length: layout.cols * layout.rows }, (_, i) => (
        <rect key={i} className="drawer-cell" x={sx(i % layout.cols) + 1} y={sy(Math.floor(i / layout.cols) + 1) + 1} width={GRID - 2} height={GRID - 2} rx={3} />
      ))}
      {seamsX.map((c) => <line key={`x${c}`} className="drawer-seam" x1={sx(c)} x2={sx(c)} y1={0} y2={D} />)}
      {seamsY.map((r) => <line key={`y${r}`} className="drawer-seam" x1={0} x2={W} y1={sy(r)} y2={sy(r)} />)}
      {layout.modules.map((m) => {
        const on = selected.includes(m.id);
        const x = sx(m.x), y = sy(m.y + m.h), w = m.w * GRID, hh = m.h * GRID;
        const corners: [number, number, number, number][] = [
          [x, y + hh, m.x + m.w - 1, m.y + m.h - 1],
          [x + w, y + hh, m.x, m.y + m.h - 1],
          [x, y, m.x + m.w - 1, m.y],
          [x + w, y, m.x, m.y],
        ];
        return (
          <g key={m.id} className="drawer-module" data-selected={on || undefined} role="button" tabIndex={0} aria-pressed={on} aria-label={label(m)} onPointerDown={(e) => down(e, m)} onKeyDown={(e) => key(e, m)}>
            <rect x={x + INSET} y={y + INSET} width={w - 2 * INSET} height={hh - 2 * INSET} rx={3.5} style={{ fill: m.color }} />
            {m.label.trim() && (
              <text x={x + w / 2} y={y + hh / 2} className="drawer-module-label" fontSize={Math.min(8, GRID / 4)}>
                {m.label.trim()}
              </text>
            )}
            {on &&
              selected.length === 1 &&
              corners.map(([cx, cy, ax, ay], i) => (
                <g key={i} onPointerDown={(e) => down(e, m, [ax, ay])}>
                  <rect x={cx - t / 2} y={cy - t / 2} width={t} height={t} fill="transparent" />
                  <rect className="gizmo-handle scale" x={cx - h / 2} y={cy - h / 2} width={h} height={h} />
                </g>
              ))}
          </g>
        );
      })}
      {drawRect && <rect className="drawer-draw" x={sx(drawRect.x)} y={sy(drawRect.y + drawRect.h)} width={drawRect.w * GRID} height={drawRect.h * GRID} rx={3} />}
    </svg>
  );
}
