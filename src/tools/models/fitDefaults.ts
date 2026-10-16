import { validatedFit } from "../../geometry/fits";
import type { FitKey } from "../../geometry/testKit/catalog";

/**
 * Os valores de partida que a pessoa validou no Kit de testes (#247): `{ parâmetro do modelo: chave da folga }`. Só entram os que ela
 * lançou; sem nenhum, devolve `{}` e o modelo abre com o padrão de fábrica. Serve de `liveDefaults` dos Modelos prontos.
 */
export const fitDefaults = (map: Record<string, FitKey>): Record<string, number> =>
  Object.fromEntries(Object.entries(map).flatMap(([param, key]) => { const v = validatedFit(key); return v === undefined ? [] : [[param, v]]; }));
