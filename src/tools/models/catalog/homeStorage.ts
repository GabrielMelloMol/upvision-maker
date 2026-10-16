import { Disc3, Grid2x2, Grid3x3, LayoutGrid, Package, Ruler, RulerDimensionLine, TestTube, Wrench } from "lucide-react";
import { buildDiscBox, DEFAULT_DISC_BOX, DISC_ITEMS } from "../../../geometry/models/discBox";
import { buildGridBase, buildGridBin, buildGridTest, DEFAULT_GRID_BASE, DEFAULT_GRID_BIN } from "../../../geometry/models/gridfinity";
import { buildLidBox, DEFAULT_LID_BOX } from "../../../geometry/models/lidBox";
import { buildPegboard, buildPegHooks, DEFAULT_PEG_HOOKS, DEFAULT_PEGBOARD } from "../../../geometry/models/pegboard";
import { buildRuler3d, DEFAULT_RULER } from "../../../geometry/models/ruler3d";
import { as, bool, choice, color, num, text, type ModelDef } from "../fields";

/** Casa, organização: caixa com tampa e o sistema Gridfinity (caixinhas e base). */
export const HOME_STORAGE_MODELS: ModelDef[] = [
  {
    id: "discBox",
    category: "organize",
    label: "Caixa de discos",
    blurb: "CDs, DVDs ou Blu-rays em pé, cada um no seu vão, com entalhe para pegar e tampa com o nome em 2 cores. A tampa imprime de cabeça para baixo, sem ponte.",
    icon: Disc3,
    font: true,
    defaults: DEFAULT_DISC_BOX,
    sections: [
      { title: "O que guarda", fields: [choice("kind", "Tipo", Object.entries(DISC_ITEMS).map(([id, i]) => [id, i.label] as const)), num("count", "Quantos", 1, 24, { step: 1, unit: "", hint: "Uma caixa comum de CD ocupa 12 mm de largura; a caixa e a tampa juntas cabem na mesa da A1 até uns 6 (com mais, saem em duas mesas)." })] },
      { title: "Tampa", fields: [text("text", "Nome na tampa", 16)] },
      { title: "Cores", fields: [color("bodyColor", "Caixa"), color("lidColor", "Tampa"), color("textColor", "Nome")] },
      { title: "Prévia", fields: [choice("layout", "Prévia", [["print", "Mesa (o que imprime)"], ["assembled", "Mesa e fechada ao lado (o 3MF leva só a mesa)"]])] },
    ],
    build: (ctx, p) => buildDiscBox(ctx, as(p)),
  },
  {
    id: "pegboard",
    category: "home",
    label: "Painel perfurado",
    blurb: "Painel de furos para pendurar ferramentas, com parafusos de cabeça chata e espaçadores atrás. Se passa da mesa, sai em ladrilhos cortados entre os furos.",
    icon: LayoutGrid,
    defaults: DEFAULT_PEGBOARD,
    sections: [
      { title: "Tamanho", fields: [num("width", "Largura", 50, 1000, { step: 1, cm: true, hint: "Vira um número inteiro de colunas de furos." }), num("height", "Altura", 50, 1000, { step: 1, cm: true }), num("thickness", "Espessura", 3, 10, { step: 0.5 })] },
      { title: "Furos", fields: [choice("pitch", "Distância entre furos", [["25", "25 mm (painel comum)"], ["20", "20 mm"]]), num("hole", "Diâmetro do furo", 4, 10, { step: 0.5 })] },
      { title: "Parede", fields: [bool("screws", "Furos de parafuso nos cantos"), num("standoff", "Espaçador atrás", 0, 25, { step: 1, hint: "Afasta o painel da parede para o pino do gancho passar." })] },
      { title: "Cor", fields: [color("color", "Painel")] },
    ],
    build: (ctx, p) => buildPegboard(ctx, as({ ...p, pitch: Number(p.pitch) })),
  },
  {
    id: "pegHooks",
    category: "home",
    label: "Ganchos do painel",
    blurb: "Ganchos em J, duplos ou hastes retas com pino redondo no diâmetro do furo do painel (folga de 0,4 mm). Várias cópias por mesa.",
    icon: Wrench,
    defaults: DEFAULT_PEG_HOOKS,
    sections: [
      { title: "Gancho", fields: [choice("kind", "Tipo", [["j", "Em J"], ["double", "Em J duplo (dois pinos)"], ["rod", "Haste reta"]]), num("count", "Quantos", 1, 24, { step: 1, unit: "" }), num("length", "Comprimento do braço", 15, 120, { step: 1 }), num("lip", "Ponta para cima", 6, 40, { step: 1 })] },
      { title: "Painel", fields: [num("hole", "Diâmetro do furo", 4, 10, { step: 0.5 }), choice("pitch", "Distância entre furos", [["25", "25 mm"], ["20", "20 mm"]]), num("thickness", "Espessura do painel", 3, 10, { step: 0.5 })] },
      { title: "Cor", fields: [color("color", "Ganchos")] },
    ],
    build: (ctx, p) => buildPegHooks(ctx, as({ ...p, pitch: Number(p.pitch) })),
  },
  {
    id: "lidBox",
    category: "home",
    label: "Caixa com tampa",
    blurb: "Você dá a medida de dentro; tampa de encaixe ou deslizante, divisórias e texto ou desenho na tampa em 2 cores.",
    icon: Package,
    font: true,
    art: "Desenho na tampa (opcional)",
    defaults: DEFAULT_LID_BOX,
    sections: [
      {
        title: "Medidas de dentro",
        fields: [
          num("innerW", "Largura", 10, 250, { step: 1 }),
          num("innerD", "Profundidade", 10, 250, { step: 1 }),
          num("innerH", "Altura", 5, 200, { step: 1 }),
          num("wall", "Parede", 1.2, 4),
          num("floor", "Fundo", 0.8, 4),
          num("radius", "Canto arredondado", 0, 15, { step: 0.5 }),
          num("dividersX", "Compartimentos na largura", 1, 8, { step: 1, unit: "" }),
          num("dividersY", "Compartimentos na profundidade", 1, 8, { step: 1, unit: "" }),
        ],
      },
      {
        title: "Tampa",
        fields: [
          choice("lid", "Tipo", [["snap", "Encaixe"], ["slide", "Deslizante"]]),
          num("clearance", "Folga", 0.2, 0.5, { step: 0.05, hint: "0,3 fecha firme; aumente se ficar dura." }),
          num("lidT", "Espessura", 1.2, 4),
        ],
      },
      {
        title: "Texto e cores",
        fields: [
          text("text", "Texto na tampa", 24),
          choice("textMode", "Texto", [["inlay", "Embutido"], ["raised", "Em relevo"], ["engraved", "Gravado"]]),
          num("textSize", "Altura do texto", 4, 40),
          num("relief", "Relevo / gravação", 0.4, 1.6),
          num("artSize", "Altura do desenho", 10, 150, { step: 1 }),
          color("boxColor", "Caixa"),
          color("lidColor", "Tampa"),
          color("decorColor", "Texto e desenho"),
        ],
      },
    ],
    build: (ctx, p) => buildLidBox(ctx, as(p)),
  },
  {
    id: "gridBin",
    category: "home",
    label: "Gridfinity: caixinha",
    blurb: "Caixinha do sistema de grade de 42 mm, com divisórias, aba e etiqueta, ímãs e borda empilhável.",
    icon: Grid2x2,
    font: true,
    defaults: DEFAULT_GRID_BIN,
    sections: [
      {
        title: "Tamanho",
        fields: [
          num("unitsX", "Largura (casas de 42 mm)", 1, 6, { step: 1, unit: "" }),
          num("unitsY", "Profundidade (casas)", 1, 6, { step: 1, unit: "" }),
          num("unitsZ", "Altura (unidades de 7 mm)", 2, 20, { step: 1, unit: "" }),
          num("dividersX", "Compartimentos na largura", 1, 8, { step: 1, unit: "" }),
          num("dividersY", "Compartimentos na profundidade", 1, 8, { step: 1, unit: "" }),
        ],
      },
      {
        title: "Detalhes",
        fields: [
          bool("lip", "Borda empilhável"),
          bool("labelTab", "Aba de etiqueta"),
          bool("scoop", "Rampa para pegar"),
          bool("magnets", "Furos de ímã 6×2 mm"),
          bool("screws", "Furos de parafuso"),
          num("wall", "Parede", 0.8, 3),
          num("floor", "Fundo", 0.8, 3),
          text("label", "Etiqueta impressa (opcional)", 30),
          color("binColor", "Caixinha"),
          color("labelColor", "Etiqueta"),
          color("textColor", "Texto da etiqueta"),
        ],
      },
    ],
    build: (ctx, p) => buildGridBin(ctx, as(p)),
  },
  {
    id: "gridBase",
    category: "home",
    label: "Gridfinity: base",
    blurb: "Base com um encaixe por casa de 42 mm; grande, sai em pedaços que cabem na mesa.",
    icon: Grid3x3,
    defaults: DEFAULT_GRID_BASE,
    sections: [
      {
        title: "Base",
        fields: [
          num("unitsX", "Largura (casas)", 1, 20, { step: 1, unit: "" }),
          num("unitsY", "Profundidade (casas)", 1, 20, { step: 1, unit: "" }),
          bool("magnets", "Fundo com furos de ímã"),
          num("bedMargin", "Margem da mesa", 0, 20, { step: 1, hint: "4 mm: 6 casas por pedaço na A1 (252 mm). Aumente se usar brim." }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildGridBase(ctx, as({ ...p, mode: "cells" })),
  },
  {
    id: "gridDrawerBase",
    category: "home",
    label: "Gridfinity: base pela gaveta",
    blurb: "Meça a gaveta: o app calcula as casas, a margem de cada lado, os pedaços e a altura que cabe.",
    icon: Ruler,
    defaults: { ...DEFAULT_GRID_BASE, mode: "drawer" },
    sections: [
      {
        title: "Gaveta (medidas de dentro)",
        fields: [
          num("drawerW", "Largura", 50, 1000, { step: 1, cm: true }),
          num("drawerD", "Profundidade", 50, 1000, { step: 1, cm: true }),
          num("drawerH", "Altura livre", 20, 300, { step: 1, cm: true, hint: "Do fundo da gaveta ao tampo ou à gaveta de cima." }),
          choice("align", "Sobra", [["center", "Centralizar"], ["corner", "Encostar no canto"]]),
        ],
      },
      {
        title: "Base",
        fields: [
          bool("magnets", "Fundo com furos de ímã"),
          num("bedMargin", "Margem da mesa", 0, 20, { step: 1, hint: "4 mm: 6 casas por pedaço na A1 (252 mm). Aumente se usar brim." }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildGridBase(ctx, as({ ...p, mode: "drawer" })),
  },
  {
    id: "gridTest",
    category: "home",
    label: "Gridfinity: teste de encaixe",
    blurb: "Base 2×1 e caixinha 1×1 para conferir a folga antes de imprimir a gaveta inteira.",
    icon: TestTube,
    defaults: { color: DEFAULT_GRID_BASE.color },
    sections: [{ title: "Teste", fields: [color("color", "Cor")] }],
    build: (ctx, p) => buildGridTest(ctx, as(p)),
  },
  {
    id: "ruler3d",
    category: "home",
    label: "Régua de 25 cm",
    blurb: "Régua fina com marcas de mm, para medir a gaveta; imprime em poucos minutos na A1.",
    icon: RulerDimensionLine,
    font: true,
    defaults: DEFAULT_RULER,
    sections: [
      {
        title: "Régua",
        fields: [
          num("length", "Comprimento", 100, 250, { step: 10 }),
          num("thickness", "Espessura", 1, 3),
          bool("split", "Em 2 partes (mesa pequena)"),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildRuler3d(ctx, as(p)),
  },
];
