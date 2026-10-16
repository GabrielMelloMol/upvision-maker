import type { GuideDef, ModelDef, Preset } from "../fields";
import { familyOf } from "../families";
import type { Variant } from "../variants";
import { FAMILY_HELP, GENERIC_HELP } from "./familyHelp";

/** As variações prontas viram "Comece pelo uso": o nome é o da variação e a frase diz o que o clique faz. */
export const variantPresets = (variants: Variant[]): Preset[] =>
  variants.map((v) => ({ id: v.label, label: v.label, blurb: v.blurb ?? `Preenche os campos com o exemplo "${v.label}": depois você muda o que quiser.`, patch: v.patch }));

/**
 * O guia de um modelo (#209): o dele, se tiver (a caixa organizadora); senão as variações prontas como sugestões e a ajuda
 * da família (quando usar, dicas, perguntas) com a tabela de campos que sai do próprio modelo.
 */
export function guideFor(def: ModelDef, variants: Variant[]): GuideDef {
  if (def.guide) return def.guide;
  return { presets: variantPresets(variants), help: FAMILY_HELP[familyOf(def.id).id] ?? GENERIC_HELP };
}
