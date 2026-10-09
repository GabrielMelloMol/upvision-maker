import { MODELS } from "../tools/models/defs";
import { familyOf } from "../tools/models/families";
import { MODEL_ALIASES } from "../tools/models/search";
import { COLLECTIONS, inCollection } from "../tools/models/variants";
import type { SearchItem } from "./search";

/**
 * Os Modelos prontos na busca do ⌘K ("abajur", "geladeira", "tecla" abrem o modelo). Fica num módulo à parte, carregado só
 * quando a busca abre, para a abertura do app não puxar o catálogo inteiro.
 */
export const MODEL_ITEMS: SearchItem[] = MODELS.map((m) => ({
  id: `model-${m.id}`,
  title: m.label,
  subtitle: `Modelos prontos › ${familyOf(m.id).label}`,
  group: "Modelos prontos",
  icon: m.icon,
  pageId: "models",
  intent: { id: m.id },
  keywords: `${MODEL_ALIASES[m.id] ?? ""} ${COLLECTIONS.filter(([c]) => inCollection(m.id, c)).map(([, l]) => l).join(" ")} ${m.blurb}`,
}));
