import { Grid3x3 } from "lucide-react";
import { buildGridCutter, DEFAULT_GRID_CUTTER } from "../../geometry/models/gridCutter";
import { as, bool, color, num, text, type ModelDef } from "./fields";

/** Modelos de cozinha e casa da fila da Lupa (#63, #65, #66, #73, #59, #64, #75). */
export const LUPA_MODELS: ModelDef[] = [
  {
    id: "gridCutter",
    category: "kitchen",
    label: "Cortador em grade",
    blurb: "Corta massa e fondant em retângulos iguais de uma vez, com abas de pega e nome.",
    icon: Grid3x3,
    font: true,
    fontSection: 1,
    defaults: DEFAULT_GRID_CUTTER,
    sections: [
      {
        title: "Grade",
        fields: [
          num("cellWidth", "Largura da célula", 10, 120, { step: 1 }),
          num("cellHeight", "Altura da célula", 10, 120, { step: 1 }),
          num("cols", "Colunas", 1, 12, { step: 1, unit: "" }),
          num("rows", "Linhas", 1, 12, { step: 1, unit: "" }),
          num("cornerRadius", "Arredondar os cantos", 0, 15, { step: 0.5 }),
        ],
      },
      {
        title: "Lâmina e abas",
        fields: [
          num("height", "Altura", 8, 40, { step: 1 }),
          num("wall", "Espessura da lâmina", 0.6, 2, { step: 0.1, hint: "0,8 mm corta bem; menos que 0,6 some no fatiador." }),
          num("flangeHeight", "Altura da aba de apoio", 1, 5, { hint: "Fica virada para a mesa ao imprimir." }),
          num("flangeWidth", "Largura da aba de apoio", 1, 6),
          bool("tabs", "Abas de pega nas laterais"),
          num("tabLength", "Comprimento das abas", 12, 40, { step: 1 }),
          text("tabText", "Texto nas abas", 12),
          num("relief", "Relevo do texto", 0.4, 2),
          color("bodyColor", "Cortador"),
          color("textColor", "Texto"),
        ],
      },
    ],
    build: (ctx, p) => buildGridCutter(ctx, as({ ...p, rows: Number(p.rows), cols: Number(p.cols) })),
  },
];
