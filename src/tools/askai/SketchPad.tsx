import { Eraser, PenLine } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import Sheet from "../../ui/Sheet";

const W = 720;
const H = 480;
const WIDTHS = [2, 4, 8] as const;

type Props = { onDone: (png: Blob) => void; onClose: () => void };

/** Esboço rápido à mão livre (#89): traço preto em fundo branco, vira PNG anexado ao pedido. */
export default function SketchPad({ onDone, onClose }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<[number, number] | null>(null);
  const [width, setWidth] = useState<number>(WIDTHS[1]);
  const [empty, setEmpty] = useState(true);

  useEffect(() => clear(), []);

  function clear() {
    const g = canvas.current?.getContext("2d");
    if (!g) return;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, W, H);
    setEmpty(true);
  }

  /** Ponteiro → pixel do canvas (o canvas é reduzido na tela). */
  function at(e: PointerEvent): [number, number] {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / (r.width || W), ((e.clientY - r.top) * H) / (r.height || H)];
  }

  function draw(e: PointerEvent) {
    const g = canvas.current?.getContext("2d");
    if (!g || !last.current) return;
    const p = at(e);
    g.strokeStyle = "#000";
    g.lineWidth = width;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(...last.current);
    g.lineTo(...p);
    g.stroke();
    last.current = p;
    setEmpty(false);
  }

  function done() {
    canvas.current?.toBlob((b) => b && onDone(b), "image/png");
  }

  return (
    <Sheet
      title="Esboço rápido"
      icon={PenLine}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="primary" disabled={empty} onClick={done}>
            Anexar esboço
          </button>
        </>
      }
    >
      <p className="hint">Desenhe a forma e anote as medidas que souber (ex.: “90 mm”). Vai como imagem no próximo pedido.</p>
      <div className="row">
        <div className="seg" role="group" aria-label="Espessura do traço">
          {WIDTHS.map((w) => (
            <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)}>
              {w === 2 ? "Fino" : w === 4 ? "Médio" : "Grosso"}
            </button>
          ))}
        </div>
        <button type="button" className="ghost" onClick={clear}>
          <Eraser aria-hidden size={16} /> Limpar
        </button>
      </div>
      <canvas
        ref={canvas}
        className="sketch-canvas"
        width={W}
        height={H}
        aria-label="Área de desenho"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          last.current = at(e);
        }}
        onPointerMove={draw}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
      />
    </Sheet>
  );
}
