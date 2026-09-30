import type { AmsNeed } from "../../geometry/amsNeed";
import table from "./amsNeed.json";

/**
 * Precisa de AMS? de cada Modelo pronto no padrão (#118), para o selo e o filtro "funciona sem AMS" da galeria.
 * Gerada por `npm run ams-table`; modelo que pede foto/SVG fica fora (sem selo). Na tela do modelo o selo é
 * recalculado com o que a pessoa gerou (ExportButtons).
 */
export const AMS_NEED = table as Record<string, AmsNeed>;
export const worksWithoutAms = (id: string) => AMS_NEED[id] !== undefined && AMS_NEED[id] !== "ams";
