import { CORE_KINDS, massGrams, type CoreKind, type LightenStats } from "../../geometry/lighten";

export type Compared = { kind: CoreKind; stats: LightenStats };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const g = (v: number) => `${massGrams(v).toFixed(1).replace(".", ",")} g`;
const weakest = (s: LightenStats) => Math.min(s.sections.x, s.sections.y, s.sections.z);
const nameOf = (kind: CoreKind) => CORE_KINDS.find(([k]) => k === kind)![1];

/**
 * As 3 estruturas lado a lado (#236): massa estimada em PLA, economia e a menor seção que sobra em cada direção. A "seção" é só a
 * área de material da fatia mais fraca, não uma análise de carga: serve para comparar as opções entre si.
 */
export default function LightenCompare({ rows, current, onPick }: { rows: Compared[]; current: CoreKind; onPick: (k: CoreKind) => void }) {
  const lightest = rows.reduce((a, b) => (b.stats.volume < a.stats.volume ? b : a)).kind;
  const strongest = rows.reduce((a, b) => (weakest(b.stats) / b.stats.volume > weakest(a.stats) / a.stats.volume ? b : a)).kind;
  return (
    <div className="stack">
      <ul className="compare-list" aria-label="Comparação das estruturas">
        {rows.map(({ kind, stats }) => (
          <li key={kind} className="compare-row" aria-current={kind === current}>
            <header>
              <span>{nameOf(kind)}</span>
              <span>
                {kind === lightest && <span className="badge ok">mais leve</span>} {kind === strongest && <span className="badge ok">mais firme pelo peso</span>}
              </span>
            </header>
            <dl>
              <dt>Massa</dt>
              <dd>
                {g(stats.volume)} (economia de {pct(1 - stats.volume / stats.solidVolume)})
              </dd>
              <dt title="Menor seção de material em cada direção, comparada à peça maciça">Menor seção</dt>
              <dd>
                X {pct(stats.sections.x)} · Y {pct(stats.sections.y)} · Z {pct(stats.sections.z)}
              </dd>
            </dl>
            <button type="button" className="sm" disabled={kind === current} onClick={() => onPick(kind)}>
              {kind === current ? "Em uso" : `Usar ${nameOf(kind).toLowerCase()}`}
            </button>
          </li>
        ))}
      </ul>
      <span className="hint">Estimativa em PLA (1,24 g/cm³). A menor seção só compara as opções entre si: não é uma simulação de carga. Para peça que segura peso, imprima um teste e force.</span>
    </div>
  );
}
