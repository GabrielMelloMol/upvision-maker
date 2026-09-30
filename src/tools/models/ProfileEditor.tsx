import { Minus, Plus } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { catmullRom, MAX_POINTS, MIN_POINTS, parseProfile } from "../../geometry/models/vase";

type Props = { label: string; value: string; onChange: (v: string) => void; min: number; max: number };

const W = 240; // largura do desenho (mm de raio viram x)
const H = 200;
const PAD = 12;
const STEP = 1;
const BIG_STEP = 5;
const CURVE_SAMPLES = 60;

const fmt = (list: number[]) => list.map((r) => Math.round(r * 10) / 10).join(", ");

/**
 * Perfil do vaso (#92): meia silhueta com os pontos de controle, de baixo para cima. Arrastar um ponto muda o raio
 * dele; setas ←/→ também (Shift: 5 mm). "+"/"−" acrescentam ou tiram pontos (4 a 8). O campo de texto aceita os
 * raios digitados.
 */
export default function ProfileEditor({ label, value, onChange, min, max }: Props) {
  const pts = parseProfile(value);
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const valid = pts.length >= MIN_POINTS;
  const x = (r: number) => PAD + ((r - 0) / max) * (W - 2 * PAD);
  const y = (t: number) => H - PAD - t * (H - 2 * PAD); // t: 0 embaixo, 1 em cima
  const set = (i: number, r: number) => onChange(fmt(pts.map((v, j) => (j === i ? Math.min(max, Math.max(min, r)) : v))));

  function toRadius(e: PointerEvent): number {
    const m = svg.current?.getScreenCTM?.();
    if (!m) return pts[drag ?? 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return ((p.x - PAD) / (W - 2 * PAD)) * max;
  }

  function onKey(e: KeyboardEvent, i: number) {
    const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!d) return;
    e.preventDefault();
    set(i, pts[i] + d * (e.shiftKey ? BIG_STEP : STEP));
  }

  const curve = valid
    ? Array.from({ length: CURVE_SAMPLES + 1 }, (_, k) => `${k ? "L" : "M"}${x(catmullRom(pts, k / CURVE_SAMPLES))} ${y(k / CURVE_SAMPLES)}`).join("")
    : "";

  return (
    <div className="span-2 stack profile-editor">
      <span className="field-label">{label}</span>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${label}: arraste os pontos para os lados`} onPointerMove={(e) => drag !== null && set(drag, toRadius(e))} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        <line className="profile-axis" x1={PAD} x2={PAD} y1={PAD} y2={H - PAD} />
        {valid && <path className="profile-curve" d={curve} />}
        {pts.map((r, i) => (
          <circle
            key={i}
            className="profile-point"
            data-active={drag === i || undefined}
            cx={x(r)}
            cy={y(i / (pts.length - 1))}
            r={6}
            tabIndex={0}
            role="slider"
            aria-label={`Ponto ${i + 1} (de baixo para cima)`}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={r}
            aria-valuetext={`${r} mm`}
            onPointerDown={(e) => {
              (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
              setDrag(i);
            }}
            onKeyDown={(e) => onKey(e, i)}
          />
        ))}
      </svg>
      <div className="row">
        <button type="button" className="ghost icon-only" aria-label="Tirar um ponto" disabled={pts.length <= MIN_POINTS} onClick={() => onChange(fmt(pts.slice(0, -1)))}>
          <Minus aria-hidden size={16} />
        </button>
        <button type="button" className="ghost icon-only" aria-label="Acrescentar um ponto" disabled={pts.length >= MAX_POINTS} onClick={() => onChange(fmt([...pts, pts[pts.length - 1] ?? min]))}>
          <Plus aria-hidden size={16} />
        </button>
        <label className="profile-text">
          Raios (mm, de baixo para cima)
          <input value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
    </div>
  );
}
