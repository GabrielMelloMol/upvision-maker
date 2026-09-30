import { printerLabel, type CatalogPrinter } from "../../domain/catalog/printers";
import type { SanityWarning } from "../../domain/sanity";
import Alert from "../../ui/Alert";

type Props = {
  /** Potência digitada parece a da fonte: impressora do catálogo com o consumo médio. */
  psuFix: CatalogPrinter | undefined;
  watts: number;
  onUseWatts: (w: number) => void;
  warnings: SanityWarning[];
  onDismiss: (key: string) => void;
};

/** Avisos do resumo: potência da fonte em vez do consumo e valores fora do normal ("Está certo" esconde). */
export default function CalcWarnings({ psuFix, watts, onUseWatts, warnings, onDismiss }: Props) {
  return (
    <>
      {psuFix && (
        <Alert kind="warn">
          {watts} W parece a potência da fonte (a da etiqueta), não o consumo. Imprimindo, a {printerLabel(psuFix)} gasta em média ~{psuFix.watts} W.{" "}
          <button type="button" className="link" onClick={() => onUseWatts(psuFix.watts)}>
            Usar {psuFix.watts} W
          </button>
        </Alert>
      )}
      {warnings.map((w) => (
        <Alert key={w.key} kind="warn">
          {w.text}{" "}
          <button type="button" className="link" onClick={() => onDismiss(w.key)}>
            Está certo
          </button>
        </Alert>
      ))}
    </>
  );
}
