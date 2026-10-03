import type { ManifoldToplevel } from "../geometry/manifold";
import { buildToolFit, DEFAULT_TOOL_FIT, type ToolFitParams } from "../geometry/models/toolFit";
import { buildModularDrawer } from "../geometry/models/toolFitDrawer";
import { instances } from "../tools/drawer/printPlan";
import { DEFAULT_PROFILE } from "../geometry/printProfile";
import { EXAMPLE_OUTLINES } from "../organizer/examples";
import { bedWarnings } from "../tools/models/bedCheck";
import type { QaCase } from "./cases";

/*
 * Organizador pela foto (#169) na varredura (#90): as 3 ferramentas de exemplo em cada saída, nos limites dos campos
 * da tela (folga 0 e 2 mm, profundidade 3 e 60, gaveta pequena e grande).
 */
const MANY = [...EXAMPLE_OUTLINES, ...EXAMPLE_OUTLINES.map((o) => ({ ...o, id: `${o.id}-2`, label: `${o.label} 2` }))];

export function toolFitCases(M: ManifoldToplevel): QaCase[] {
  const run = (p: Partial<ToolFitParams>, tools = EXAMPLE_OUTLINES) => async () => {
    const out = buildToolFit(M, tools, { ...DEFAULT_TOOL_FIT, ...p });
    const warnings = [...(out.warnings ?? []), ...out.notes]; // no relatório entram os dois (notas são "app:" sem mudar o resultado)
    return { models: out.models, pauses: [], warnings: [...warnings, ...bedWarnings(out.models, warnings)] };
  };
  // gaveta modular: o que se imprime são os pedaços da base e uma caixinha por ferramenta
  const modular = (p: Partial<ToolFitParams>, tools = EXAMPLE_OUTLINES) => async () => {
    const out = buildModularDrawer(M, tools, { ...DEFAULT_TOOL_FIT, mode: "drawer", drawerKind: "bins", ...p }, {});
    return { models: instances(out.basePieces, out.groups), pauses: [], warnings: [...out.warnings, ...out.notes] };
  };
  const list: [string, ReturnType<typeof run>][] = [
    ["padrão", run({})],
    ["mínimo", run({ clearance: 0, depth: 3, floor: 1, wall: 1.2, finger: false })],
    ["máximo", run({ clearance: 2, depth: 60, floor: 10, wall: 10 })],
    ["gridfinity", run({ mode: "gridfinity" })],
    ["gaveta", run({ mode: "drawer", drawerW: 450, drawerD: 320 }, MANY)],
    ["gaveta pequena", run({ mode: "drawer", drawerW: 200, drawerD: 150 })],
    ["peça de teste", run({ mode: "test" })],
    ["gaveta modular", modular({ drawerW: 400, drawerD: 300, drawerH: 80 })],
    ["gaveta modular cheia", modular({ drawerW: 450, drawerD: 320, drawerH: 60, depth: 24 }, MANY)],
    ["gaveta modular individual", modular({ drawerW: 400, drawerD: 300, drawerH: 80, binHeight: "each", lip: false })],
  ];
  return list.map(([variant, build]) => ({ key: `toolfit:${variant}`, owner: "Torno", group: "tools", label: "Organizador pela foto (ferramenta)", variant, profile: DEFAULT_PROFILE, build }));
}
