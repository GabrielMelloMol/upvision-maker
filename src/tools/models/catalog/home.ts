import type { ModelDef } from "../fields";
import { HOME_DECOR_MODELS } from "./homeDecor";
import { HOME_PROJECT_MODELS } from "./homeProjects";
import { HOME_STORAGE_MODELS } from "./homeStorage";

/** Modelos prontos da categoria Casa, na ordem da galeria (separados por assunto e tamanho). */
export const HOME_MODELS: ModelDef[] = [...HOME_DECOR_MODELS, ...HOME_PROJECT_MODELS, ...HOME_STORAGE_MODELS];
