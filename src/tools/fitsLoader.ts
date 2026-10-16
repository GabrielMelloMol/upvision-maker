import { loadSettings } from "../db/repo";
import type { Db } from "../db/types";
import { setFits } from "../geometry/fits";
import type { Fits } from "../geometry/testKit/catalog";

/** Relê as folgas validadas (Ajustes › Kit de testes) e entrega às ferramentas. Devolve o que ficou em uso. */
export async function refreshFits(db: Db): Promise<Fits> {
  const fits = (await loadSettings(db)).fits as Fits;
  setFits(fits);
  return fits;
}
