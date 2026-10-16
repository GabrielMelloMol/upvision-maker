import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { drawCells, pocketPath } from "../../geometry/mosaic/draw";
import { normCell, paintCell, type Cell, type MosaicGrid } from "../../geometry/mosaic/grid";
import type { MosaicColor } from "../../geometry/mosaic/pieces";
import { placedOutline, ROTATES, SHAPES, type MosaicShape } from "../../geometry/mosaic/shapes";

/** O que o pincel pinta: uma cor do kit (ou null = apagar), o formato e o giro. */
export type Brush = { color: string | null; shape: MosaicShape; rot: number };

const P = 40; // passo da casa no desenho (unidades do SVG)
const PIECE = 0.9;

/** Ícone de um formato (contorno girado), para os botões do pincel. */
export function ShapeIcon({ shape, rot = 0, size = 20 }: { shape: MosaicShape; rot?: number; size?: number }) {
  const pts = placedOutline(shape, rot, 16, 10, 10, 12).map(([x, y]) => `${x.toFixed(2)},${(20 - y).toFixed(2)}`).join(" ");
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <polygon points={pts} fill="currentColor" />
      {shape === "eye" && <circle cx="10" cy="10" r="3.2" fill="var(--surface)" />}
    </svg>
  );
}

type Props = { grid: MosaicGrid; colors: MosaicColor[]; brush: Brush; onChange: (g: MosaicGrid) => void; /** Só mostra o desenho (prévia do cartão): sem pincel e sem teclado. */ readOnly?: boolean };

/**
 * Editor da grade do desenho (#206): clicar ou arrastar pinta com o pincel; setas movem o cursor e Espaço pinta, Delete apaga.
 * Cada pincelada é um estado novo; quem usa junta tudo num passo de desfazer.
 */
export default function MosaicEditor({ grid, colors, brush, onChange, readOnly = false }: Props) {
  const down = useRef(false);
  const [cursor, setCursor] = useState<[number, number]>([0, 0]);
  const [focused, setFocused] = useState(false);
  const pocket = P * 0.96;
  const stamp = (): Cell | null => (brush.color === null ? null : normCell({ color: brush.shape === "eye" ? "white" : brush.color, shape: brush.shape, rot: brush.rot }));

  function paintAt(e: PointerEvent<SVGSVGElement>) {
    const b = e.currentTarget.getBoundingClientRect();
    const c = Math.floor(((e.clientX - b.left) / b.width) * grid.cols);
    const r = Math.floor(((e.clientY - b.top) / b.height) * grid.rows);
    setCursor([Math.min(grid.cols - 1, Math.max(0, c)), Math.min(grid.rows - 1, Math.max(0, r))]);
    const next = paintCell(grid, c, r, stamp());
    if (next !== grid) onChange(next);
  }

  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    const [c, r] = cursor;
    const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (move[e.key]) {
      e.preventDefault();
      setCursor([Math.min(grid.cols - 1, Math.max(0, c + move[e.key][0])), Math.min(grid.rows - 1, Math.max(0, r + move[e.key][1]))]);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(paintCell(grid, c, r, stamp()));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onChange(paintCell(grid, c, r, null));
    }
  }

  const cells = drawCells(grid, colors, P, P * PIECE);
  return (
    <svg
      className={`mosaic-svg${readOnly ? " read-only" : ""}`}
      viewBox={`0 0 ${grid.cols * P} ${grid.rows * P}`}
      {...(readOnly
        ? { role: "img", "aria-label": `Desenho do mosaico, ${grid.cols} por ${grid.rows} casas.` }
        : {
            role: "application",
            tabIndex: 0,
            "aria-label": `Desenho do mosaico, ${grid.cols} por ${grid.rows} casas. Clique ou arraste para pintar com o pincel escolhido. Com o teclado: setas movem, Espaço pinta, Delete apaga.`,
            onFocus: () => setFocused(true),
            onBlur: () => setFocused(false),
            onKeyDown: onKey,
            onPointerDown: (e: PointerEvent<SVGSVGElement>) => {
              e.currentTarget.setPointerCapture?.(e.pointerId);
              down.current = true;
              paintAt(e);
            },
            onPointerMove: (e: PointerEvent<SVGSVGElement>) => down.current && paintAt(e),
            onPointerUp: () => (down.current = false),
            onPointerCancel: () => (down.current = false),
          })}
    >
      <rect className="mosaic-paper" width={grid.cols * P} height={grid.rows * P} />
      {grid.cells.map((_, i) => (
        <path key={i} className="mosaic-pocket" d={pocketPath(i % grid.cols, Math.floor(i / grid.cols), P, pocket)} />
      ))}
      {cells.map((c) => (
        <g key={`${c.col}-${c.row}`}>
          <path d={c.d} fill={c.color.hex} className="mosaic-piece" />
          {c.pupil && <circle cx={c.pupil.cx} cy={c.pupil.cy} r={c.pupil.r} fill="#1c1c1e" />}
        </g>
      ))}
      {focused && <rect className="mosaic-cursor" x={cursor[0] * P + 1} y={cursor[1] * P + 1} width={P - 2} height={P - 2} />}
    </svg>
  );
}

/** Botões do pincel: cor do kit, formato e giro. */
export function BrushBar({ colors, brush, onChange }: { colors: MosaicColor[]; brush: Brush; onChange: (b: Brush) => void }) {
  return (
    <div className="stack">
      <span className="field-label">Cor</span>
      <div className="chips" role="group" aria-label="Cor do pincel">
        {colors.map((c) => (
          <button key={c.key} type="button" aria-pressed={brush.color === c.key} onClick={() => onChange({ ...brush, color: c.key })}>
            <span className="swatch-inline">
              <i style={{ background: c.hex }} />
              {c.label}
            </span>
          </button>
        ))}
        <button type="button" aria-pressed={brush.color === null} onClick={() => onChange({ ...brush, color: null })}>
          Apagar
        </button>
      </div>
      <span className="field-label">Formato</span>
      <div className="chips" role="group" aria-label="Formato do pincel">
        {SHAPES.map((s) => (
          <button key={s.id} type="button" aria-pressed={brush.shape === s.id} title={s.hint} onClick={() => onChange({ ...brush, shape: s.id })}>
            <span className="swatch-inline">
              <ShapeIcon shape={s.id} rot={brush.rot} />
              {s.label}
            </span>
          </button>
        ))}
        <button type="button" disabled={!ROTATES(brush.shape)} onClick={() => onChange({ ...brush, rot: (brush.rot + 1) % 4 })} title="Gira o formato em 90°">
          Girar
        </button>
      </div>
    </div>
  );
}
