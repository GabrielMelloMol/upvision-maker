import { useEffect, useState } from "react";

type Option = { id: string; label: string };

/**
 * "Modelo pronto" do produto (#164): com ele, "Preparar impressão" no pedido abre o modelo com a personalização.
 * A lista vem dos Modelos prontos sob demanda (não pesa a tela de Produtos).
 */
export default function ModelSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const [options, setOptions] = useState<Option[] | null>(null);
  useEffect(() => {
    let alive = true;
    import("../../tools/models/defs")
      .then(({ MODELS }) => alive && setOptions(MODELS.map((m) => ({ id: m.id, label: m.label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))))
      .catch(() => alive && setOptions([]));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="field">
      <label>
        Modelo pronto (opcional)
        <select value={value ?? ""} disabled={!options} aria-describedby="model-select-hint" onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Nenhum (peça própria)</option>
          {/* id gravado de um modelo que não existe mais: mostra para não sumir sem aviso */}
          {value && options && !options.some((o) => o.id === value) && <option value={value}>{value} (não encontrado)</option>}
          {(options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {/* fora do label: não entra no nome do campo (leitor de tela e testes) */}
      <span className="hint" id="model-select-hint">
        No pedido, &quot;Preparar impressão&quot; abre este modelo com a personalização do item.
      </span>
    </div>
  );
}
