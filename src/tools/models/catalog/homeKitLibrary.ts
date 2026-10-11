import { Rocket, Tractor } from "lucide-react";
import { rocketKit } from "../../../geometry/kit/models/rocket";
import { tractorKit } from "../../../geometry/kit/models/tractor";
import type { ModelDef } from "../fields";
import { kitTemplateDef } from "../kitTemplateDef";

/** Biblioteca de kit cards projetados (Casa › Brinquedos): cada modelo é um KitTemplate com cartão, cores, escala e arte em relevo. */
export const HOME_KIT_LIBRARY_MODELS: ModelDef[] = [kitTemplateDef(rocketKit, { category: "home", icon: Rocket }), kitTemplateDef(tractorKit, { category: "home", icon: Tractor })];
