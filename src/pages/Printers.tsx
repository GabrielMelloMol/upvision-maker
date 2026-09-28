import { printers } from "../db/repo";
import { Printer } from "lucide-react";
import { MEASURE_TIP, PRINTER_CATALOG_ITEMS, printerFromCatalog } from "../domain/catalog/printers";
import CrudPage from "../ui/CrudPage";

export default function Printers() {
  return (
    <CrudPage
      pageId="printers"
      title="Impressoras"
      singular="Impressora"
      lead="A potência média de cada impressora entra no custo de energia da calculadora."
      empty={{ icon: Printer, text: "Cadastre sua impressora e a potência média dela para a calculadora incluir a energia no preço." }}
      repo={printers}
      fields={[
        { key: "name", label: "Nome", kind: "text", placeholder: "Ex.: Bambu Lab A1" },
        { key: "watts", label: "Potência média (W)", kind: "number", placeholder: "Ex.: 120", hint: `Média imprimindo PLA, não a máxima da fonte. ${MEASURE_TIP}` },
      ]}
      defaults={{ name: "", watts: "" }}
      catalog={{
        title: "Catálogo de impressoras",
        icon: Printer,
        items: PRINTER_CATALOG_ITEMS,
        toForm: printerFromCatalog,
      }}
    />
  );
}
