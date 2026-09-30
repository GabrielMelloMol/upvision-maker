import { useEffect, useRef, useSyncExternalStore, type PointerEvent } from "react";
import { paint, withColor, type PixelGrid } from "../../geometry/pixelArt";

type Props = { grid: PixelGrid; brush: string | null; onChange: (g: PixelGrid) => void };

const MAX_PX = 560; // lado do desenho na tela
const MAX_CELL = 40;
const DARK = "(prefers-color-scheme: dark)";

/** Tema atual: o canvas precisa redesenhar quando o sistema troca claro/escuro. */
function useDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(DARK);
      mq?.addEventListener("change", cb);
      return () => mq?.removeEventListener("change", cb);
    },
    () => window.matchMedia?.(DARK).matches ?? false,
  );
}

/** Cor de um token do tema (o canvas não lê var() sozinho). */
const token = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();

/**
 * Editor da pixel art (#95): clicar ou arrastar pinta com o pincel (cor em hex; null = apagar).
 * Cada pintura é um estado novo; quem usa junta tudo num passo de desfazer.
 */
export default function PixelEditor({ grid, brush, onChange }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dark = useDark();
  const cell = Math.max(4, Math.min(MAX_CELL, Math.floor(MAX_PX / Math.max(grid.cols, grid.rows))));

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    ctx.fillStyle = token(cv, "--surface-2");
    ctx.fillRect(0, 0, cv.width, cv.height);
    grid.cells.forEach((v, i) => {
      if (v < 0) return;
      ctx.fillStyle = grid.palette[v];
      ctx.fillRect((i % grid.cols) * cell, Math.floor(i / grid.cols) * cell, cell, cell);
    });
    ctx.strokeStyle = token(cv, "--grid-minor");
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= grid.cols; c++) {
      ctx.moveTo(c * cell + 0.5, 0);
      ctx.lineTo(c * cell + 0.5, grid.rows * cell);
    }
    for (let r = 0; r <= grid.rows; r++) {
      ctx.moveTo(0, r * cell + 0.5);
      ctx.lineTo(grid.cols * cell, r * cell + 0.5);
    }
    ctx.stroke();
  }, [grid, cell, dark]);

  function at(e: PointerEvent<HTMLCanvasElement>) {
    const b = e.currentTarget.getBoundingClientRect();
    const col = Math.floor(((e.clientX - b.left) / b.width) * grid.cols);
    const row = Math.floor(((e.clientY - b.top) / b.height) * grid.rows);
    const [g, idx] = brush ? withColor(grid, brush) : [grid, -1];
    const next = paint(g, col, row, idx);
    if (next !== grid) onChange(next);
  }

  return (
    <canvas
      ref={ref}
      className="pixel-canvas"
      width={grid.cols * cell + 1}
      height={grid.rows * cell + 1}
      role="img"
      aria-label={`Grade de pixels, ${grid.cols} × ${grid.rows}. Clique ou arraste para pintar com a cor escolhida; as cores estão na legenda abaixo.`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drawing.current = true;
        at(e);
      }}
      onPointerMove={(e) => drawing.current && at(e)}
      onPointerUp={() => (drawing.current = false)}
      onPointerCancel={() => (drawing.current = false)}
    />
  );
}
