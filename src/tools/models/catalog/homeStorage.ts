import { Grid2x2, Grid3x3, Package, Ruler, TestTube } from "lucide-react";
import { buildGridBase, buildGridBin, buildGridTest, DEFAULT_GRID_BASE, DEFAULT_GRID_BIN } from "../../../geometry/models/gridfinity";
import { buildLidBox, DEFAULT_LID_BOX } from "../../../geometry/models/lidBox";
import { as, bool, choice, color, num, text, type ModelDef } from "../fields";

/** Casa, organização: caixa com tampa e o sistema Gridfinity (caixinhas e base). */
export const HOME_STORAGE_MODELS: ModelDef[] = [
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
          num("drawerW", "Largura", 50, 1000, { step: 1 }),
          num("drawerD", "Profundidade", 50, 1000, { step: 1 }),
          num("drawerH", "Altura livre", 20, 300, { step: 1, hint: "Do fundo da gaveta ao tampo ou à gaveta de cima." }),
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
];
