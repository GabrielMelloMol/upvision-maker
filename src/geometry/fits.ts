import { fitOrDefault, type FitKey, type Fits } from "./testKit/catalog";

/**
 * Folgas validadas no Kit de testes físicos (#247): o app lê as Preferências ao abrir e a cada troca de tela (como a mesa da
 * impressora) e as ferramentas pegam daqui o padrão. Sem valor lançado, vale o padrão de fábrica da ferramenta.
 */
let current: Fits = {};

export const setFits = (f: Fits | null) => {
  current = f ?? {};
};
/** O valor que a pessoa validou, ou `undefined` se ainda não lançou nenhum. */
export const validatedFit = (key: FitKey): number | undefined => current[key];
/** O valor validado ou, sem ele, o padrão de fábrica. */
export const fitValue = (key: FitKey): number => fitOrDefault(current, key);
