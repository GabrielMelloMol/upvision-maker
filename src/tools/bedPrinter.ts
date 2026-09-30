import { findCatalogPrinter } from "../domain/catalog/printers";
import { loadSettings, printers as printersRepo } from "../db/repo";
import type { Db } from "../db/types";
import { bedFor, setBed, type Bed } from "../geometry/bed";

/** Atualiza a mesa das ferramentas pela impressora escolhida nas Preferências (#119). Devolve a mesa em uso. */
export async function refreshBed(db: Db): Promise<Bed> {
  const [list, s] = await Promise.all([printersRepo.list(db), loadSettings(db)]);
  const b = bedFor(list, s.bedPrinterId, (name) => findCatalogPrinter(name)?.volume);
  setBed(b);
  return b;
}
