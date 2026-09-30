import { Calculator } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getDb } from "../db";
import { filaments as filamentsRepo } from "../db/repo";
import type { Filament } from "../domain/entities";
import { densityOfMaterial, ESTIMATE_ERROR_PCT, estimateModels } from "../domain/estimate";
import { money } from "../domain/format";
import type { PrintProfile } from "../geometry/printProfile";
import type { Model } from "../geometry/types";
import { setPendingEstimate } from "../pages/calculator/pendingFile";
import { colorSwatch } from "./ColorDots";
import { requestNavigate } from "./navigate";
import { formatDuration } from "./parse";

const grams = (g: number) => `${g.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g`;

/** Filamento cadastrado com a cor da parte (mesmo casamento das cores das ferramentas), ou nada. */
export function filamentForColor(list: Filament[], color: string): Filament | undefined {
  const c = color.toLowerCase();
  return list.find((f) => colorSwatch(f.color)?.toLowerCase() === c);
}

/**
 * Gramas, tempo e R$ ao vivo nas ferramentas 3D (#99), sem fatiar. R$ é só o filamento, com o preço do filamento da
 * cor (ou a média dos cadastrados). "Levar para a Calculadora" preenche gramas por filamento e o tempo.
 */
export default function EstimateCard({ models, profile, name, busy }: { models: Model[]; profile?: PrintProfile; name: string; busy?: boolean }) {
  const [stock, setStock] = useState<Filament[]>([]);
  useEffect(() => {
    getDb()
      .then(filamentsRepo.list)
      .then(setStock)
      .catch(() => {}); // sem banco (prévia solta): estima com PLA e sem R$
  }, []);

  const est = useMemo(
    () => estimateModels(models, profile, (color) => densityOfMaterial(filamentForColor(stock, color)?.material)),
    [models, profile, stock],
  );
  if (!est || busy) return null;

  const avgPrice = stock.length ? stock.reduce((s, f) => s + f.pricePerKg, 0) / stock.length : null;
  const lines = est.byColor.map((c) => ({ ...c, filament: filamentForColor(stock, c.color) }));
  const cost = avgPrice === null ? null : lines.reduce((s, l) => s + (l.grams / 1000) * (l.filament?.pricePerKg ?? avgPrice), 0);

  function toCalculator() {
    setPendingEstimate({
      filaments: lines.map((l) => ({ filamentId: l.filament?.id ?? null, pricePerKg: l.filament?.pricePerKg ?? null, grams: l.grams })),
      printerWatts: null, // mantém a impressora e a potência já escolhidas na calculadora
      seconds: est!.seconds,
      name,
    });
    requestNavigate("calculator");
  }

  return (
    <div className="estimate" role="group" aria-label="Estimativa sem fatiar">
      <strong>
        ≈ {grams(est.grams)} · ≈ {formatDuration(est.seconds / 60)}
        {cost !== null && ` · ≈ ${money(cost)} de filamento`}
      </strong>
      {lines.length > 1 && (
        <ul className="estimate-colors">
          {lines.map((l) => (
            <li key={l.color}>
              <i style={{ background: l.color }} aria-hidden /> {l.filament ? [l.filament.material, l.filament.color].filter(Boolean).join(" ") : "cor sem filamento cadastrado"}: {grams(l.grams)}
            </li>
          ))}
        </ul>
      )}
      <span className="hint">Estimativa pela forma, sem fatiar: pode errar ±{ESTIMATE_ERROR_PCT}%. O valor do fatiador prevalece.</span>
      <button type="button" className="sm" onClick={toCalculator}>
        <Calculator aria-hidden /> Levar para a Calculadora
      </button>
    </div>
  );
}
