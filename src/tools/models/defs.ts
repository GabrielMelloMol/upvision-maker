import { HOME_MODELS } from "./catalog/home";
import { KEYCHAIN_MODELS } from "./catalog/keychains";
import { KITCHEN_MODELS } from "./catalog/kitchen";
import { PARTY_MODELS } from "./catalog/party";
import { PLATE_MODELS } from "./catalog/plates";
import { withBedCheck } from "./bedCheck";
import type { ModelDef, Params } from "./fields";

export { CATEGORIES, type Category, type FieldDef, type ModelDef, type Params, type Section } from "./fields";

/**
 * Registro único dos Modelos prontos: um arquivo por categoria em `catalog/` (veja docs/DESENVOLVIMENTO.md, "Como adicionar um
 * modelo pronto"). A ordem aqui é a da galeria; o 1º modelo (Placa Pix) é o que abre. Todos passam pela checagem
 * de mesa (#129, #130, #131).
 */
export const MODELS: ModelDef[] = [...PLATE_MODELS, ...KEYCHAIN_MODELS, ...PARTY_MODELS, ...HOME_MODELS, ...KITCHEN_MODELS].map(withBedCheck);

/** Números dentro dos limites (os campos fora da faixa ficam marcados e não geram o modelo). */
export function validParams(def: ModelDef, p: Params): boolean {
  return def.sections.every((s) => s.fields.every((f) => f.kind !== "num" || (Number.isFinite(p[f.k]) && (p[f.k] as number) >= f.min && (p[f.k] as number) <= f.max)));
}
