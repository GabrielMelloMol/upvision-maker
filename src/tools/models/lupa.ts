import { CakeSlice, Grid3x3, Lollipop } from "lucide-react";
import { buildCakeStand, buildStickStand, DEFAULT_CAKE_STAND, DEFAULT_STICK_STAND } from "../../geometry/models/confectionery";
import { buildGridCutter, DEFAULT_GRID_CUTTER } from "../../geometry/models/gridCutter";
import { as, bool, choice, color, num, text, type ModelDef } from "./fields";

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
  {
    id: "stickStand",
    category: "kitchen",
    label: "Suporte de palitos",
    blurb: "Base com furos para pirulito, cake pop e topo de bolo; leve, maciça ou com lugar para peso.",
    icon: Lollipop,
    defaults: DEFAULT_STICK_STAND,
    sections: [
      {
        title: "Furos",
        fields: [
          num("holes", "Quantos palitos", 1, 60, { step: 1, unit: "" }),
          num("stickDiameter", "Diâmetro do palito", 2, 12, { step: 0.5 }),
          num("clearance", "Folga do furo", 0, 1, { step: 0.05 }),
          num("spacing", "Distância entre os palitos", 10, 60, { step: 1 }),
          num("holeDepth", "Profundidade do furo", 5, 60, { step: 1 }),
        ],
      },
      {
        title: "Base",
        fields: [
          num("height", "Altura", 10, 70, { step: 1 }),
          choice("base", "Base", [["light", "Leve (oca por baixo)"], ["solid", "Maciça"], ["weight", "Com lugar para peso"]]),
          num("wall", "Parede", 1.2, 5),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildStickStand(ctx, as({ ...p, holes: Number(p.holes) })),
  },
  {
    id: "cakeStand",
    category: "kitchen",
    label: "Boleira",
    blurb: "Prato com pé, borda ondulada e nome; impressa numa peça, de cabeça para baixo, sem suporte.",
    icon: CakeSlice,
    font: true,
    defaults: DEFAULT_CAKE_STAND,
    sections: [
      { title: "Nome", fields: [text("name", "Nome na borda (opcional)", 30), num("nameSize", "Altura das letras", 6, 30, { step: 1 })] },
      {
        title: "Prato e pé",
        fields: [
          num("diameter", "Diâmetro do prato", 80, 250, { step: 1 }),
          num("thickness", "Espessura do prato", 2.5, 8),
          num("waves", "Ondas da borda", 0, 40, { step: 1, unit: "", hint: "0 = borda lisa." }),
          num("waveDepth", "Tamanho das ondas", 0, 10),
          num("height", "Altura", 30, 200, { step: 1 }),
          num("columnDiameter", "Diâmetro da coluna", 15, 80, { step: 1 }),
          num("footDiameter", "Diâmetro do pé", 30, 200, { step: 1, hint: "O pé abre a 45°: pé largo pede mais altura." }),
          num("wall", "Parede do pé", 1.6, 5),
          color("plateColor", "Boleira"),
          color("nameColor", "Nome"),
        ],
      },
    ],
    build: (ctx, p) => buildCakeStand(ctx, as(p)),
  },
];
