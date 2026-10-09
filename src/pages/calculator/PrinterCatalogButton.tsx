import { Printer as PrinterIcon } from "lucide-react";
import { useState } from "react";
import { getDb } from "../../db";
import { printers as printersRepo } from "../../db/repo";
import { PRINTER_CATALOG, PRINTER_CATALOG_ITEMS, printerLabel } from "../../domain/catalog/printers";
import type { Printer } from "../../domain/entities";
import CatalogSheet from "../../ui/CatalogSheet";
import { errorText, useToast } from "../../ui/Toast";

type Props = { printers: Printer[]; onPicked: (p: Printer) => void };

/** "Escolher do catálogo" fora da tela de Impressoras: usa a já cadastrada com o mesmo nome ou cadastra na hora. */
export default function PrinterCatalogButton({ printers, onPicked }: Props) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  async function pick(catalogId: string) {
    setOpen(false);
    const c = PRINTER_CATALOG.find((x) => x.id === catalogId);
    if (!c) return;
    const name = printerLabel(c);
    const same = printers.find((p) => p.name.trim().toLowerCase() === name.toLowerCase());
    if (same) return onPicked(same);
    try {
      const input = { name, watts: c.watts, price: 0, lifeHours: 5000, upkeepPerHour: 0, nozzle: c.nozzle ?? 0.4 };
      const id = await printersRepo.insert(await getDb(), input);
      onPicked({ id, ...input });
      toast(`${name} cadastrada em Impressoras (${c.watts} W). Lá você informa o preço pago.`);
    } catch (err) {
      toast(`Não foi possível cadastrar a impressora: ${errorText(err)}`, "error");
    }
  }

  return (
    <>
      <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}>
        Escolher do catálogo
      </button>
      {open && <CatalogSheet title="Catálogo de impressoras" icon={PrinterIcon} items={PRINTER_CATALOG_ITEMS} onPick={pick} onManual={() => setOpen(false)} onClose={() => setOpen(false)} />}
    </>
  );
}
