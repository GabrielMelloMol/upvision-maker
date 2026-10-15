import { useMemo } from "react";
import { estimateModels } from "../../domain/estimate";
import type { Model } from "../../geometry/types";

const mm = (n: number) => n.toFixed(1).replace(".", ",");
const duration = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.max(1, Math.round(s / 60))} min`);

/** Peso e tempo de cada peça (a estimativa de baixo é o total): dá para ver o que custa o pedaço separado. */
export default function PiecesCard({ models }: { models: Model[] }) {
  const rows = useMemo(() => models.map((m) => ({ m, est: estimateModels([m]) })), [models]);
  if (rows.length < 2) return null;
  return (
    <div className="card stack" aria-label="Peso e tempo por peça">
      <h3>Por peça</h3>
      <ul className="stack">
        {rows.map(({ m, est }) => (
          <li key={m.name}>
            <span className="swatch-inline">
              <i style={{ background: m.parts[0]?.color }} />
              {m.name.replace(/^.* · /, "")}
            </span>{" "}
            <span className="muted">{est ? `· ≈ ${mm(est.grams)} g · ≈ ${duration(est.seconds)}` : "· sem estimativa"}</span>
          </li>
        ))}
      </ul>
      <span className="hint">Estimativa pela forma, sem fatiar (±20%). Cada peça impressa sozinha.</span>
    </div>
  );
}
