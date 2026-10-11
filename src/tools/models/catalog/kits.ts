import { Package, PawPrint } from "lucide-react";
import { bauTemplate } from "../../../geometry/kit/designs/bauKit";
import { bichoTemplate } from "../../../geometry/kit/designs/bichoKit";
import type { ModelDef } from "../fields";
import { kitTemplateDef } from "../kitTemplateDef";

/** Biblioteca de kits de montar projetados (KitTemplate): o Kit card por imagem fica em `homeDecor.ts`. */
export const KIT_MODELS: ModelDef[] = [
  kitTemplateDef(bichoTemplate, { category: "gifts", icon: PawPrint }),
  kitTemplateDef(bauTemplate, { category: "gifts", icon: Package }),
];
