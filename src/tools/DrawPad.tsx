import { useRef, useState, type PointerEvent } from "react";
import { GUIDES, PAD, simplify, type Strokes } from "../geometry/handwriting";

type Pt = [number, number];

/**
 * Quadro de desenho (#314): mouse, caneta de tablet ou dedo. Coordenadas de 0 a 100 (Y para baixo).
 * `guides` mostra as linhas da letra (topo, altura do "x" e base).
 */
export default function DrawPad({ strokes, onChange, guides, label, size = 260 }: { strokes: Strokes; onChange: (s: Strokes) => void; guides?: boolean; label: string; size?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [cur, setCur] = useState<Pt[] | null>(null);

  const at = (e: PointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect();
    const c = (v: number) => Math.min(PAD, Math.max(0, v));
    return [c(((e.clientX - r.left) / r.width) * PAD), c(((e.clientY - r.top) / r.height) * PAD)];
  };
  const down = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setCur([at(e)]);
  };
  const move = (e: PointerEvent) => cur && setCur([...cur, at(e)]);
  const up = () => {
    if (cur) {
      const s = simplify(cur);
      // um toque sem arrastar vira um pontinho (pingo do i)
      onChange([...strokes, s.length >= 2 ? s : [s[0], [s[0][0] + 0.5, s[0][1]]]]);
    }
    setCur(null);
  };
  const line = (pts: Pt[]) => pts.map((p) => p.join(",")).join(" ");

  return (
    <svg
      ref={ref}
      className="draw-pad"
      viewBox={`0 0 ${PAD} ${PAD}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      style={{ touchAction: "none", background: "#fff", border: "1px solid var(--line, #ccc)", borderRadius: 8, cursor: "crosshair", maxWidth: "100%" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {guides &&
        Object.entries(GUIDES).map(([k, y]) => <line key={k} x1={0} x2={PAD} y1={y} y2={y} stroke={k === "base" ? "#9aa3c7" : "#dde1ee"} strokeWidth={k === "base" ? 0.6 : 0.4} strokeDasharray={k === "x" ? "2 2" : undefined} />)}
      {[...strokes, ...(cur ? [cur] : [])].map((s, i) => (
        <polyline key={i} points={line(s)} fill="none" stroke="#0B1F66" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
