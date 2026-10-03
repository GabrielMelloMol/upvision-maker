import { boundsOf, orient } from "../../geometry/models/toolFitLayout";
import type { Sheet, ToolOutline } from "../../organizer/types";

const mm = (n: number) => n.toFixed(0);
/** Raio do número de cada ferramenta no desenho (mm da folha). */
const NUM_R = 7;
const path = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`;

/** Medida real da ferramenta: o menor retângulo que a contém (comprimento × largura), em mm. */
export function toolSize(o: ToolOutline): [number, number] {
  const b = boundsOf(orient(o).points);
  return [b.maxX - b.minX, b.maxY - b.minY];
}

/**
 * Prévia 2D (#169): a folha com o contorno de cada ferramenta e o número dela (o mesmo da lista, da foto e do mapa).
 * Nome e medida ficam na lista de ferramentas do projeto.
 */
export default function SheetPreview({ outlines, sheet }: { outlines: (ToolOutline & { num?: number })[]; sheet: Sheet }) {
  const { widthMm: W, heightMm: H } = sheet;
  const desc = outlines.map((o) => `${o.label ?? o.id}: ${toolSize(o).map(mm).join(" × ")} mm`).join("; ");
  return (
    <figure className="card sheet-preview" style={{ margin: 0 }}>
      <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} role="img" aria-label={`Folha de ${W} × ${H} mm. ${desc}`} style={{ width: "100%", maxHeight: 360, display: "block" }}>
        <rect x={0} y={0} width={W} height={H} fill="var(--surface)" stroke="var(--border-strong)" strokeWidth={0.6} />
        {/* origem no canto de baixo da folha: y para cima, como no 3D */}
        <g transform={`translate(0 ${H}) scale(1 -1)`}>
          {outlines.map((o) => (
            <path key={o.id} d={[o.points, ...(o.holes ?? [])].map(path).join(" ")} fillRule="evenodd" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={0.8} />
          ))}
        </g>
        {/* só o número no desenho (nomes longos se sobrepunham); nome e medida na lista embaixo, como na foto */}
        {outlines.map((o, i) => {
          const b = boundsOf(o.points);
          const [cx, cy] = [(b.minX + b.maxX) / 2, H - (b.minY + b.maxY) / 2];
          return (
            <g key={o.id} className="tool-num" transform={`translate(${cx} ${cy})`}>
              <circle r={NUM_R} />
              <text fontSize={NUM_R * 1.2} dy="0.35em">
                {o.num ?? i + 1}
              </text>
            </g>
          );
        })}
        <text x={W / 2} y={H + 5} textAnchor="middle" fontSize={5} fill="var(--muted)">
          {W} mm
        </text>
      </svg>
      <figcaption>
        <p className="hint">Medida de cada ferramenta no menor retângulo que a contém. Confira com uma régua antes de imprimir.</p>
      </figcaption>
    </figure>
  );
}
