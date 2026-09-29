import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ElementBox } from "../../geometry/models/common";
import type { FaceInfo, LayerShape } from "./applyLayers";
import { normalizeRotation, rotatedHalf, snapPosition, type Guides, type Layer } from "./layers";

const PAD_MM = 6;
const HANDLE_PX = 7;
const ROTATE_ARM_PX = 26;
const MIN_WIDTH_MM = 2;
const NUDGE_MM = 1;
const NUDGE_BIG_MM = 5;

const pathOf = (polys: [number, number][][]) => polys.map((p) => `M${p.map(([x, y]) => `${x} ${y}`).join("L")}Z`).join("");

type Drag = { id: string; mode: "move" | "scale" | "rotate"; p0: [number, number]; start: Layer; draft: Partial<Layer>; guides: Guides };
/** Arraste de um elemento interno do modelo (#79): `d` = deslocamento em mm desde o começo do gesto. */
type ElDrag = { id: string; p0: [number, number]; box: ElementBox["box"]; d: [number, number]; guides: Guides };
type Props = {
  face: FaceInfo;
  layers: Layer[];
  shapes: Record<string, LayerShape>;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** Fim de um gesto (soltar o mouse, setas): um passo no desfazer. */
  onCommit: (id: string, patch: Partial<Layer>) => void;
  /** Elementos internos do modelo (textos, QR…) que se movem arrastando (#79). */
  elements?: ElementBox[];
  onMoveElement?: (id: string, dx: number, dy: number) => void;
};

/**
 * Vista de cima da face principal (#26): arrastar move, a alça do canto escala, a alça de cima gira (Shift = 15°),
 * encaixe no centro/bordas com guias (Alt desliga). Setas movem 1 mm (Shift 5 mm). Coordenadas em mm, Y para cima.
 */
export default function DecalGizmo({ face, layers, shapes, selected, onSelect, onCommit, elements = [], onMoveElement }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const world = useRef<SVGGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [elSel, setElSel] = useState<string | null>(null);
  const [elDrag, setElDrag] = useState<ElDrag | null>(null);
  const [mmPerPx, setMmPerPx] = useState(0.25);
  const { min, max } = face.bounds;
  const vb = { x: min[0] - PAD_MM, y: -(max[1] + PAD_MM), w: max[0] - min[0] + 2 * PAD_MM, h: max[1] - min[1] + 2 * PAD_MM };

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const measure = () => el.clientWidth > 0 && setMmPerPx(Math.max(vb.w / el.clientWidth, vb.h / el.clientHeight || 0));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vb.w, vb.h]);

  /** Ponteiro → mm no sistema da peça (o grupo `world` já inverte o Y). */
  function toMm(e: { clientX: number; clientY: number }): [number, number] {
    const m = world.current?.getScreenCTM?.();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }

  function begin(e: PointerEvent, l: Layer, mode: Drag["mode"]) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(l.id);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag({ id: l.id, mode, p0: toMm(e), start: l, draft: {}, guides: { x: [], y: [] } });
  }

  function beginEl(e: PointerEvent, el: ElementBox) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(null);
    setElSel(el.id);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setElDrag({ id: el.id, p0: toMm(e), box: el.box, d: [0, 0], guides: { x: [], y: [] } });
  }

  function move(e: PointerEvent) {
    if (elDrag) {
      // o centro da caixa gruda no centro/bordas da face, como as camadas
      const p = toMm(e), b = elDrag.box;
      const c0: [number, number] = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      const x = c0[0] + p[0] - elDrag.p0[0], y = c0[1] + p[1] - elDrag.p0[1];
      const half = rotatedHalf(b[2] - b[0], b[3] - b[1], 0);
      const s = e.altKey ? { x, y, guides: { x: [], y: [] } } : snapPosition(x, y, half, face.bounds);
      setElDrag({ ...elDrag, d: [round1(s.x - c0[0]), round1(s.y - c0[1])], guides: s.guides });
      return;
    }
    if (!drag) return;
    const p = toMm(e);
    const s = drag.start;
    const shape = shapes[s.id];
    if (drag.mode === "move") {
      const x = s.x + p[0] - drag.p0[0], y = s.y + p[1] - drag.p0[1];
      const half = rotatedHalf(s.width, shape ? shape.height * (s.width / shape.width) : s.width, s.rotation);
      const snapped = e.altKey ? { x, y, guides: { x: [], y: [] } } : snapPosition(x, y, half, face.bounds);
      setDrag({ ...drag, draft: { x: round1(snapped.x), y: round1(snapped.y) }, guides: snapped.guides });
    } else if (drag.mode === "scale") {
      const d0 = Math.hypot(drag.p0[0] - s.x, drag.p0[1] - s.y) || 1;
      const d = Math.hypot(p[0] - s.x, p[1] - s.y);
      setDrag({ ...drag, draft: { width: round1(Math.max(MIN_WIDTH_MM, (s.width * d) / d0)) } });
    } else {
      const a0 = Math.atan2(drag.p0[1] - s.y, drag.p0[0] - s.x), a = Math.atan2(p[1] - s.y, p[0] - s.x);
      setDrag({ ...drag, draft: { rotation: normalizeRotation(s.rotation + ((a - a0) * 180) / Math.PI, e.shiftKey) } });
    }
  }

  function end() {
    if (elDrag && (elDrag.d[0] || elDrag.d[1])) onMoveElement?.(elDrag.id, elDrag.d[0], elDrag.d[1]);
    setElDrag(null);
    if (drag && Object.keys(drag.draft).length) onCommit(drag.id, drag.draft);
    setDrag(null);
  }

  function onKey(e: KeyboardEvent) {
    const step = e.shiftKey ? NUDGE_BIG_MM : NUDGE_MM;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    const l = layers.find((x) => x.id === selected);
    if (l) {
      e.preventDefault();
      onCommit(l.id, { x: round1(l.x + d[0]), y: round1(l.y + d[1]) });
    } else if (elSel && elements.some((x) => x.id === elSel)) {
      e.preventDefault();
      onMoveElement?.(elSel, d[0], d[1]);
    }
  }

  const h = HANDLE_PX * mmPerPx;
  const sel = layers.find((l) => l.id === selected);
  return (
    <svg
      ref={svg}
      className="decal-gizmo"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      tabIndex={0}
      role="group"
      aria-label={`Vista de cima de ${face.part}: arraste para mover, alça do canto para o tamanho, alça de cima para girar. Setas movem 1 mm.`}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => {
        setDrag(null);
        setElDrag(null);
      }}
      onPointerDown={() => {
        onSelect(null);
        setElSel(null);
      }}
      onKeyDown={onKey}
    >
      <g ref={world} transform="scale(1 -1)">
        <path className="gizmo-face" d={pathOf(face.outline)} fillRule="evenodd" />
        {face.others.length > 0 && <path className="gizmo-others" d={pathOf(face.others)} fillRule="nonzero" />}
        {elements.map((el) => {
          const d = elDrag?.id === el.id ? elDrag.d : [0, 0];
          const [x0, y0, x1, y1] = el.box;
          return (
            <rect
              key={el.id}
              className="gizmo-element"
              data-selected={(el.id === elSel && !selected) || undefined}
              x={x0 + d[0]}
              y={y0 + d[1]}
              width={x1 - x0}
              height={y1 - y0}
              onPointerDown={(e) => beginEl(e, el)}
            >
              <title>{`${el.label}: arraste para mover`}</title>
            </rect>
          );
        })}
        {layers.map((l) => {
          const shape = shapes[l.id];
          if (!shape || l.visible === false) return null;
          const v = drag?.id === l.id ? { ...l, ...drag.draft } : l;
          const k = v.width / shape.width;
          return (
            <g key={l.id} transform={`translate(${v.x} ${v.y}) rotate(${v.rotation})`} className="gizmo-layer" data-mode={l.mode} data-selected={l.id === selected || undefined} onPointerDown={(e) => begin(e, l, "move")}>
              <path d={pathOf(shape.polys)} fillRule="nonzero" transform={`scale(${(v.mirror ? -1 : 1) * k} ${k})`} style={l.mode === "raised" ? { fill: l.color } : undefined} />
              {l.id === selected && (
                <>
                  <rect className="gizmo-box" x={-v.width / 2} y={(-shape.height * k) / 2} width={v.width} height={shape.height * k} />
                  <line className="gizmo-arm" x1={0} y1={(shape.height * k) / 2} x2={0} y2={(shape.height * k) / 2 + ROTATE_ARM_PX * mmPerPx} />
                  <circle className="gizmo-handle rotate" cx={0} cy={(shape.height * k) / 2 + ROTATE_ARM_PX * mmPerPx} r={h} onPointerDown={(e) => begin(e, l, "rotate")}>
                    <title>Girar</title>
                  </circle>
                  <rect className="gizmo-handle scale" x={v.width / 2 - h} y={(shape.height * k) / 2 - h} width={2 * h} height={2 * h} onPointerDown={(e) => begin(e, l, "scale")}>
                    <title>Tamanho</title>
                  </rect>
                </>
              )}
            </g>
          );
        })}
        {(drag ?? elDrag)?.guides.x.map((x) => <line key={`gx${x}`} className="gizmo-guide" x1={x} x2={x} y1={min[1] - PAD_MM} y2={max[1] + PAD_MM} />)}
        {(drag ?? elDrag)?.guides.y.map((y) => <line key={`gy${y}`} className="gizmo-guide" y1={y} y2={y} x1={min[0] - PAD_MM} x2={max[0] + PAD_MM} />)}
      </g>
      {sel && drag && (
        <text className="gizmo-readout" x={vb.x + 2 * mmPerPx * 4} y={vb.y + vb.h - 3 * mmPerPx * 4} fontSize={12 * mmPerPx}>
          {readout({ ...sel, ...drag.draft })}
        </text>
      )}
    </svg>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const readout = (l: Layer) => `X ${fmt(l.x)} · Y ${fmt(l.y)} mm · ${fmt(l.width)} mm · ${fmt(l.rotation)}°`;
