import { estimateModels } from "../../domain/estimate";
import { MOSAIC_BOARD_PROFILE, MOSAIC_PIECES_PROFILE, MOSAIC_POT_PROFILE } from "../../geometry/printProfile";
import type { Model } from "../../geometry/types";
import { formatDuration } from "../../ui/parse";

/** Peso e tempo de cada item do kit (estimativa sem fatiar, como a do card de exportação). */
export default function KitSummary({ board, pieces, pot, lid }: { board: Model[]; pieces: Model[]; pot: Model[]; lid: Model[] }) {
  const rows = [
    { name: "Tabuleiro", est: estimateModels(board, MOSAIC_BOARD_PROFILE) },
    { name: "Peças", est: estimateModels(pieces, MOSAIC_PIECES_PROFILE) },
    { name: "Pote", est: estimateModels(pot, MOSAIC_POT_PROFILE) },
    { name: "Tampa", est: estimateModels(lid, MOSAIC_POT_PROFILE) },
  ].filter((r) => r.est);
  if (!rows.length) return null;
  return (
    <div className="card stack" role="group" aria-label="Peso e tempo de cada item">
      <h3>Peso e tempo de cada item</h3>
      <ul className="mosaic-summary">
        {rows.map((r) => (
          <li key={r.name}>
            <strong>{r.name}</strong>
            <span>
              ≈ {r.est!.grams.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} g · ≈ {formatDuration(r.est!.seconds / 60)}
            </span>
          </li>
        ))}
      </ul>
      <span className="hint">Estimativa sem fatiar, com erro de uns 20%. O valor do fatiador prevalece.</span>
    </div>
  );
}
