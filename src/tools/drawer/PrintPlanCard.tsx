import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Calculator } from "lucide-react";
import type { Filament } from "../../domain/entities";
import { money } from "../../domain/format";
import { write3mf } from "../../geometry/threemf";
import { filamentForColor } from "../../ui/EstimateCard";
import { requestNavigate } from "../../ui/navigate";
import { formatDuration } from "../../ui/parse";
import { saveFile } from "../../ui/saveFile";
import { errorText, useToast } from "../../ui/Toast";
import { useData } from "../../ui/useData";
import { setPendingEstimate } from "../../pages/calculator/pendingFile";
import { loadFilaments } from "../filamentColors";
import type { DrawerPrint } from "./printPlan";

type Props = { plan: DrawerPrint; name: string; onSaved?: () => void };

const g = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} g`;
const time = (s: number) => formatDuration(s / 60);
const fileOf = (name: string, i: number) => `${name}-mesa-${i + 1}.3mf`;

/**
 * Impressão por mesa (#140): lista de peças com quantidade, filamento, gramas e tempo; as mesas de 256 mm com um 3MF
 * cada (uma por vez ou todas numa pasta); o total vai para a Calculadora.
 */
export default function PrintPlanCard({ plan, name, onSaved }: Props) {
  const toast = useToast();
  const [stock] = useData(loadFilaments, [] as Filament[]);
  const fil = (color: string) => filamentForColor(stock, color);
  const filName = (color: string) => {
    const f = fil(color);
    return f ? [f.material, f.color].filter(Boolean).join(" ") : "cor sem filamento cadastrado";
  };
  const avg = stock.length ? stock.reduce((s, f) => s + f.pricePerKg, 0) / stock.length : null;
  const cost = avg === null ? null : plan.byColor.reduce((s, c) => s + (c.grams / 1000) * (fil(c.color)?.pricePerKg ?? avg), 0);

  async function savePlate(i: number) {
    try {
      const path = await saveFile(fileOf(name, i), write3mf(plan.plates[i].models), "3mf", "3MF");
      if (path) {
        toast(`Mesa ${i + 1} salva em ${path}`);
        onSaved?.();
      }
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  async function saveAll() {
    try {
      const dir = await open({ directory: true, multiple: false, title: "Pasta para as mesas da gaveta" });
      if (typeof dir !== "string") return;
      for (const [i, p] of plan.plates.entries()) await writeFile(await join(dir, fileOf(name, i)), write3mf(p.models));
      const n = plan.plates.length;
      toast(`${n} ${n === 1 ? "mesa salva" : "mesas salvas"} em ${dir}`);
      onSaved?.();
    } catch (e) {
      toast(`Não foi possível salvar: ${errorText(e)}`, "error");
    }
  }

  function toCalculator() {
    setPendingEstimate({
      filaments: plan.byColor.map((c) => ({ filamentId: fil(c.color)?.id ?? null, pricePerKg: fil(c.color)?.pricePerKg ?? null, grams: c.grams })),
      printerWatts: null,
      seconds: plan.seconds,
      name: "Organizador de gaveta",
    });
    requestNavigate("calculator");
  }

  return (
    <div className="card stack" aria-label="Impressão por mesa">
      <h3>Impressão</h3>
      <table className="drawer-print">
        <thead>
          <tr>
            <th scope="col">Peça</th>
            <th scope="col">Qtd.</th>
            <th scope="col">Filamento</th>
            <th scope="col">Gramas</th>
            <th scope="col">Tempo</th>
          </tr>
        </thead>
        <tbody>
          {plan.rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.count}</td>
              <td>
                {r.colors.map((c) => (
                  <span key={c} className="swatch-inline">
                    <i style={{ background: c }} aria-hidden /> {filName(c)}
                  </span>
                ))}
              </td>
              <td>{g(r.grams)}</td>
              <td>{time(r.seconds)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Total{cost !== null && ` · ≈ ${money(cost)} de filamento`}
            </th>
            <td>{g(plan.grams)}</td>
            <td>{time(plan.seconds)}</td>
          </tr>
        </tfoot>
      </table>
      <ol className="drawer-plates">
        {plan.plates.map((p, i) => (
          <li key={i}>
            <span>
              <strong>Mesa {i + 1}</strong>: {p.models.length} peça{p.models.length === 1 ? "" : "s"} · ≈ {g(p.grams)} · ≈ {time(p.seconds)}
            </span>
            <button type="button" className="sm ghost" onClick={() => void savePlate(i)}>
              Salvar mesa {i + 1}
            </button>
          </li>
        ))}
      </ol>
      <div className="row">
        <button type="button" className="ghost" onClick={() => void saveAll()} disabled={!plan.plates.length}>
          Salvar todas as mesas numa pasta
        </button>
        <button type="button" className="sm" onClick={toCalculator}>
          <Calculator aria-hidden /> Levar para a Calculadora
        </button>
      </div>
      <span className="hint">Estimativa pela forma, sem fatiar. Cada mesa sai num 3MF próprio (256 mm, com as cores e as etiquetas).</span>
    </div>
  );
}
