import { Plus, Trash2 } from "lucide-react";

type Props = { count: number; active: number; onSelect: (i: number) => void; onAdd: () => void; onRemove: () => void };

/** Lista de cortes: cada um com a sua região, plano, encaixe e cor; valem em sequência, um no que sobrou do anterior. */
export default function CutList({ count, active, onSelect, onAdd, onRemove }: Props) {
  return (
    <div className="card stack">
      <h3>Cortes</h3>
      <div className="row wrap" role="group" aria-label="Cortes">
        {Array.from({ length: count }, (_, i) => (
          <button key={i} type="button" className={i === active ? "sm primary" : "sm"} aria-pressed={i === active} onClick={() => onSelect(i)}>
            Corte {i + 1}
          </button>
        ))}
        <button type="button" className="sm" onClick={onAdd}>
          <Plus aria-hidden /> Adicionar corte
        </button>
        {count > 1 && (
          <button type="button" className="sm" onClick={onRemove} aria-label={`Remover o corte ${active + 1}`}>
            <Trash2 aria-hidden /> Remover
          </button>
        )}
      </div>
      {count > 1 && <span className="hint">Cada corte vale no que sobrou do anterior; cada pedaço sai como um objeto no 3MF.</span>}
    </div>
  );
}
