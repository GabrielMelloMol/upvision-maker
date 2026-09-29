import { CakeSlice, CircleDot, Egg, Grid3x3, Lollipop, Stamp } from "lucide-react";
import { buildScrewCase, DEFAULT_SCREW_CASE } from "../../geometry/models/screwCase";
import { buildStampMold, DEFAULT_STAMP_MOLD } from "../../geometry/models/stampMold";
import { buildOutlineBowl, DEFAULT_OUTLINE_BOWL } from "../../geometry/models/outlineBowl";
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
  {
    id: "outlineBowl",
    category: "home",
    label: "Cumbuca no contorno",
    blurb: "Cestinha de lembrancinha no formato de qualquer desenho fechado, com o desenho em relevo no fundo.",
    icon: Egg,
    art: "Desenho fechado (o contorno vira a boca)",
    defaults: DEFAULT_OUTLINE_BOWL,
    sections: [
      {
        title: "Tamanho",
        fields: [
          num("width", "Largura", 30, 240, { step: 1 }),
          num("height", "Altura", 10, 150, { step: 1 }),
          num("shell", "Parede", 0.8, 5, { hint: "No modo vaso do fatiador, a parede vira 1 linha: desligue o desenho no fundo." }),
          num("floor", "Fundo", 0.8, 5),
          num("bottomRadius", "Arredondar o fundo", 0, 30, { step: 0.5 }),
          num("rimRadius", "Arredondar a borda", 0, 2.5, { step: 0.1, hint: "Fuzzy skin fica bonito só na parede de fora." }),
        ],
      },
      {
        title: "Desenho no fundo e cores",
        fields: [
          bool("floorArt", "Desenho em relevo no fundo"),
          num("floorArtScale", "Tamanho do desenho no fundo", 0.2, 0.8, { step: 0.05, unit: "×" }),
          num("relief", "Relevo", 0.4, 3),
          color("bowlColor", "Cumbuca"),
          color("artColor", "Desenho"),
        ],
      },
    ],
    build: (ctx, p) => buildOutlineBowl(ctx, as(p)),
  },
  {
    id: "stampMold",
    category: "home",
    label: "Molde para carimbo de EVA",
    blurb: "Aqueça o EVA (ou use massinha) e prense no molde: o carimbo sai com o desenho e carimba do jeito certo.",
    icon: Stamp,
    font: true,
    art: "Desenho do carimbo (opcional)",
    defaults: DEFAULT_STAMP_MOLD,
    sections: [
      {
        title: "Desenho",
        fields: [
          text("text", "Texto (se não enviar desenho)", 20),
          num("size", "Tamanho do desenho", 40, 300, { step: 1, hint: "Lado maior." }),
          bool("invert", "Inverter: desenho em relevo (carimba o fundo)"),
          num("bridge", "Ligar partes soltas", 0, 5, { step: 0.5, hint: "Fecha vãos de até o dobro deste valor entre letras e pedaços soltos." }),
        ],
      },
      {
        title: "Molde e apoio",
        fields: [
          num("depth", "Profundidade", 0.6, 5),
          num("thickness", "Espessura da placa", 3, 10),
          num("margin", "Margem", 2, 20, { step: 1 }),
          bool("thumb", "Apoio de polegar (peça que encaixa atrás)"),
          num("thumbSize", "Tamanho do apoio", 15, 45, { step: 1 }),
          num("thumbX", "Posição do apoio (→)", -140, 140, { step: 1 }),
          num("thumbY", "Posição do apoio (↑)", -140, 140, { step: 1 }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildStampMold(ctx, as(p)),
  },
  {
    id: "screwCase",
    category: "home",
    label: "Estojo com tampa de rosca",
    blurb: "Porta-batom, pente de cílios ou chaveiro: você dá o tamanho de dentro e a tampa rosqueia e para alinhada.",
    icon: CircleDot,
    font: true,
    art: "Ícone para o mosaico (opcional)",
    defaults: DEFAULT_SCREW_CASE,
    sections: [
      {
        title: "Nome",
        fields: [
          text("name", "Nome", 16),
          choice("nameMode", "Nome", [["raised", "Em relevo"], ["engraved", "Gravado"], ["none", "Sem nome"]]),
          num("relief", "Relevo / gravação", 0.4, 1.6),
        ],
      },
      {
        title: "Medidas de dentro",
        fields: [
          num("innerDiameter", "Diâmetro interno", 8, 80, { step: 0.5, hint: "Batom comum: 18 a 20 mm." }),
          num("innerHeight", "Altura interna", 20, 180, { step: 1 }),
          num("wall", "Parede", 1.2, 3),
          num("floor", "Fundo", 1, 3),
        ],
      },
      {
        title: "Rosca",
        fields: [
          num("pitch", "Passo", 2, 5, { step: 0.5 }),
          num("threadDepth", "Profundidade da rosca", 0.8, 2, { step: 0.1 }),
          num("clearance", "Folga", 0.15, 0.8, { step: 0.05, hint: "0,35 costuma rosquear bem; aumente se ficar dura." }),
          num("starts", "Entradas", 1, 3, { step: 1, unit: "", hint: "2 entradas fecham em menos voltas." }),
          num("turns", "Voltas até fechar", 0.75, 4, { step: 0.25, unit: "" }),
        ],
      },
      {
        title: "Acabamento e cores",
        fields: [
          choice("texture", "Textura", [["smooth", "Lisa"], ["mosaic", "Ícone em mosaico"]]),
          num("iconSize", "Tamanho do ícone", 4, 15, { step: 0.5 }),
          bool("keyring", "Orelha para chaveiro na tampa"),
          color("bodyColor", "Corpo"),
          color("lidColor", "Tampa"),
          color("accentColor", "Nome e textura"),
        ],
      },
    ],
    build: (ctx, p) => buildScrewCase(ctx, as({ ...p, starts: Number(p.starts) })),
  },
];
