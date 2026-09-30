import type { Printer } from "../../domain/entities";
import PrinterCatalogButton from "./PrinterCatalogButton";

type Props = { printers: Printer[]; value: string; onPick: (id: string) => void; onCatalog: (p: Printer) => void };

/** Impressora cadastrada (ou "Digitar potência") e o atalho para cadastrar uma do catálogo. */
export default function PrinterSelect({ printers, value, onPick, onCatalog }: Props) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <label>
        Impressora
        <select value={value} onChange={(e) => onPick(e.target.value)}>
          <option value="">Digitar potência</option>
          {printers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <PrinterCatalogButton printers={printers} onPicked={onCatalog} />
    </div>
  );
}
