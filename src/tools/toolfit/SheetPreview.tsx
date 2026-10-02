import { boundsOf, orient } from "../../geometry/models/toolFitLayout";
import type { Sheet, ToolOutline } from "../../organizer/types";

const mm = (n: number) => n.toFixed(0);
const path = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`;

/** Medida real da ferramenta: o menor retângulo que a contém (comprimento × largura), em mm. */
export function toolSize(o: ToolOutline): [number, number] {
  const b = boundsOf(orient(o).points);
  return [b.maxX - b.minX, b.maxY - b.minY];
}

/** Prévia 2D (#169): a folha com o contorno de cada ferramenta e a medida dela, como a foto entregou. */
export default function SheetPreview({ outlines, sheet }: { outlines: ToolOutline[]; sheet: Sheet }) {
  const { widthMm: W, heightMm: H } = sheet;
  const desc = outlines.map((o) => `${o.label ?? o.id}: ${toolSize(o).map(mm).join(" × ")} mm`).join("; ");
  return (
    <figure className="card" style={{ margin: 0 }}>
      <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} role="img" aria-label={`Folha de ${W} × ${H} mm. ${desc}`} style={{ width: "100%", maxHeight: 360, display: "block" }}>
        <rect x={0} y={0} width={W} height={H} fill="var(--surface)" stroke="var(--border-strong)" strokeWidth={0.6} />
        {/* origem no canto de baixo da folha: y para cima, como no 3D */}
        <g transform={`translate(0 ${H}) scale(1 -1)`}>
          {outlines.map((o) => (
            <path key={o.id} d={[o.points, ...(o.holes ?? [])].map(path).join(" ")} fillRule="evenodd" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={0.8} />
          ))}
        </g>
        {outlines.map((o) => {
          const b = boundsOf(o.points);
          const [w, h] = toolSize(o);
          return (
            <text key={o.id} x={(b.minX + b.maxX) / 2} y={H - (b.minY + b.maxY) / 2} textAnchor="middle" fontSize={7} fill="var(--text)">
              <tspan x={(b.minX + b.maxX) / 2}>{o.label ?? o.id}</tspan>
              <tspan x={(b.minX + b.maxX) / 2} dy={8}>
                {mm(w)} × {mm(h)} mm
              </tspan>
            </text>
          );
        })}
        <text x={W / 2} y={H + 5} textAnchor="middle" fontSize={5} fill="var(--muted)">
          {W} mm
        </text>
      </svg>
      <figcaption className="hint">Medida de cada ferramenta no menor retângulo que a contém. Confira com uma régua antes de imprimir.</figcaption>
    </figure>
  );
}
