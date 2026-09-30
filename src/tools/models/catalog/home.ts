import type { ModelDef } from "../fields";
import { HOME_DECOR_MODELS } from "./homeDecor";
import { HOME_PROJECT_MODELS } from "./homeProjects";

/** Modelos prontos da categoria Casa, na ordem da galeria (dois arquivos só pelo tamanho). */
export const HOME_MODELS: ModelDef[] = [...HOME_DECOR_MODELS, ...HOME_PROJECT_MODELS];
