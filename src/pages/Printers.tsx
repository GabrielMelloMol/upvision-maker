import { printers } from "../db/repo";
import { Printer } from "lucide-react";
import { useState } from "react";
import { findCatalogPrinter, MEASURE_TIP, PRINTER_CATALOG_ITEMS, printerFromCatalog } from "../domain/catalog/printers";
import PlugSheet from "./calculator/PlugSheet";
import CrudPage from "../ui/CrudPage";

const DEFAULTS = { name: "", watts: "", nozzle: "0,4", price: "0", lifeHours: "5000", upkeepPerHour: "0" };
const NOZZLES = ["0,2", "0,4", "0,6", "0,8"];
const sameNum = (a: string, b: string) => Number(a.replace(",", ".")) === Number(b.replace(",", "."));

type Plug = { set: (v: string) => void; catalogWatts?: number };

export default function Printers() {
  const [plug, setPlug] = useState<Plug | null>(null);
  return (
    <>
    {plug && (
      <PlugSheet
        catalogWatts={plug.catalogWatts}
        onClose={() => setPlug(null)}
        onUse={(w) => {
          plug.set(String(w));
          setPlug(null);
        }}
      />
    )}
    <CrudPage
      pageId="printers"
      title="Impressoras"
      singular="Impressora"
      lead="A potência média entra no custo de energia; o preço e a vida útil viram o custo de máquina por hora."
      empty={{ icon: Printer, text: "Cadastre sua impressora e a potência média dela para a calculadora incluir a energia no preço." }}
      repo={printers}
      fields={[
        { key: "name", label: "Nome", kind: "text", placeholder: "Ex.: Bambu Lab A1" },
        { key: "watts", label: "Potência média (W)", kind: "number", placeholder: "Ex.: 120", hint: `Média imprimindo PLA, não a máxima da fonte. ${MEASURE_TIP}`,
          extra: (set, form) => (
            <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setPlug({ set, catalogWatts: findCatalogPrinter(form.name ?? "")?.watts })}>
              Medir com tomada inteligente
            </button>
          ),
        },
        { key: "nozzle", label: "Bico (mm)", kind: "number", placeholder: "0,4", hint: "Diâmetro do bico instalado. O mapa estelar e os avisos de parte fina das ferramentas usam o bico da impressora escolhida em Preferências › Impressora das ferramentas.",
          extra: (set, form) => (
            <div className="chips" role="group" aria-label="Bicos comuns">
              {NOZZLES.map((n) => (
                <button key={n} type="button" aria-pressed={sameNum(form.nozzle ?? "", n)} onClick={() => set(n)}>
                  {n} mm
                </button>
              ))}
            </div>
          ),
        },
        { key: "price", label: "Preço pago", kind: "money", hint: "Com o preço, a calculadora cobra o desgaste por hora e ignora a % de manutenção." },
        { key: "lifeHours", label: "Vida útil (h)", kind: "number", hint: "Horas de impressão até trocar a máquina. 5000 h ≈ 2 anos imprimindo 7 h por dia." },
        { key: "upkeepPerHour", label: "Desgaste por hora", kind: "money", hint: "Peças que gastam: bico, placa de impressão (PEI), correias. Deixe 0 se não souber.", formOnly: true },
      ]}
      defaults={DEFAULTS}
      catalog={{
        title: "Catálogo de impressoras",
        icon: Printer,
        items: PRINTER_CATALOG_ITEMS,
        toForm: printerFromCatalog,
      }}
    />
    </>
  );
}
