import { CircuitBoard, Grid2x2, Grid3x3, Package, Ruler, RulerDimensionLine, TestTube, Target, Smartphone, Disc3, LayoutGrid, Wrench } from "lucide-react";
import { buildBoardBox, DEFAULT_BOARD_BOX } from "../../../geometry/models/boardBox";
import { buildGridBase, buildGridBin, buildGridTest, DEFAULT_GRID_BASE, DEFAULT_GRID_BIN } from "../../../geometry/models/gridfinity";
import { buildLidBox, DEFAULT_LID_BOX } from "../../../geometry/models/lidBox";
import { buildRuler3d, DEFAULT_RULER } from "../../../geometry/models/ruler3d";
import { as, bool, choice, color, num, text, type ModelDef } from "../fields";
import { ORGANIZER_BOX_MODEL } from "./organizerBox";
import { buildSlingshot, DEFAULT_SLINGSHOT } from "../../../geometry/models/slingshot";
import { buildPhoneCase, DEFAULT_PHONE_CASE } from "../../../geometry/models/phoneCase";
import { buildDiscBox, DEFAULT_DISC_BOX, DISC_ITEMS } from "../../../geometry/models/discBox";
import { buildPegboard, buildPegHooks, DEFAULT_PEG_HOOKS, DEFAULT_PEGBOARD } from "../../../geometry/models/pegboard";
import { fitDefaults } from "../fitDefaults";

/** Casa, organização: caixa com tampa e o sistema Gridfinity (caixinhas e base). */
export const HOME_STORAGE_MODELS: ModelDef[] = [
  ORGANIZER_BOX_MODEL,
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
  {
    id: "boardBox",
    category: "home",
    label: "Caixa para placa eletrônica",
    blurb: "Caixa e tampa para Arduino, ESP32, Raspberry Pi e outras placas: a placa assenta em pinos, os conectores saem por aberturas e a tampa encaixa. Imprima antes a bandeja de teste.",
    icon: CircuitBoard,
    font: true,
    defaults: DEFAULT_BOARD_BOX,
    liveDefaults: () => fitDefaults({ clearance: "boardClearance" }), // a folga da placa validada no Kit de testes (#247)
    sections: [
      {
        title: "A placa (confira com a sua)",
        fields: [
          num("boardL", "Comprimento da placa", 15, 150, { step: 0.1, hint: "Os perfis prontos vêm das fichas dos fabricantes e podem variar de uma marca ou revisão para outra: meça a sua com paquímetro." }),
          num("boardW", "Largura da placa", 10, 110, { step: 0.1 }),
          num("boardT", "Espessura da placa", 0.8, 3, { step: 0.1, hint: "Quase todas têm 1,6 mm." }),
          text("holes", "Furos de fixação (x, y; x, y)", 120, "Em mm, a partir do canto inferior esquerdo da placa, com ponto nos decimais: 14, 2.5; 66.1, 7.6. Sem furos? Escolha \"Só apoios\" abaixo."),
          num("holeD", "Diâmetro do furo da placa", 2, 5, { step: 0.1 }),
        ],
      },
      {
        title: "Conectores",
        fields: [
          text("connectors", "Aberturas (uma por linha ou separadas por ;)", 300, "Cada abertura: lado, posição, largura, altura, altura do fundo. Lado: esquerda, direita, cima ou baixo. Posição: onde está o centro do conector, em mm, no lado escolhido. Ex.: esquerda, 38, 13, 12, 0."),
          num("headroom", "Espaço livre acima da placa", 8, 60, { step: 1, hint: "Do topo da placa até a tampa: o conector e o pino mais altos mais uma folga." }),
        ],
      },
      {
        title: "Fixação e tampa",
        fields: [
          choice("mount", "A placa fica", [["pegs", "Em pinos"], ["screws", "Com parafuso"], ["pads", "Só apoios"]]),
          num("standoffH", "Altura das colunas", 2, 12, { step: 0.5, hint: "Deixa as soldas de baixo livres: 4 mm costuma bastar." }),
          num("wall", "Parede", 1.2, 4, { step: 0.2 }),
          num("clearance", "Folga em volta da placa", 0.2, 1.5, { step: 0.1 }),
          num("lidGap", "Folga da tampa", 0.1, 0.6, { step: 0.05, hint: "0,25 encaixa com leve pressão; se a tampa não entrar, aumente de 0,05 em 0,05." }),
          num("vents", "Respiros na tampa", 0, 10, { step: 1, unit: "" }),
          text("label", "Nome gravado na tampa", 16),
          choice("print", "Imprimir", [["box", "Caixa e tampa"], ["test", "Só a bandeja de teste"]]),
          color("boxColor", "Caixa"),
          color("lidColor", "Tampa"),
        ],
      },
    ],
    build: (ctx, p) => buildBoardBox(ctx, as(p)),
  },
  {
    id: "slingshot",
    category: "home",
    label: "Estilingue personalizado",
    blurb: "Estilingue plano em Y, com o nome na empunhadura e furos para amarrar o elástico. Brinquedo e hobby: leia os cuidados antes de imprimir.",
    icon: Target,
    font: true,
    defaults: DEFAULT_SLINGSHOT,
    sections: [
      {
        title: "Nome",
        fields: [
          text("name", "Nome na empunhadura", 12),
          choice("nameMode", "Nome", [["raised", "Em relevo (outra cor)"], ["engraved", "Gravado"], ["none", "Sem nome"]]),
          num("depth", "Profundidade ou relevo", 0.5, 2, { step: 0.1 }),
        ],
      },
      {
        title: "Formato",
        fields: [
          num("handleLen", "Comprimento do cabo", 60, 140, { step: 1 }),
          num("handleW", "Largura do cabo", 22, 45, { step: 1, hint: "Confortável na mão: 28 a 34 mm." }),
          num("forkLen", "Comprimento da forquilha", 35, 90, { step: 1 }),
          num("spread", "Abertura entre as pontas", 25, 100, { step: 1, hint: "De centro a centro dos furos do elástico." }),
          num("armW", "Largura dos braços", 12, 26, { step: 0.5, hint: "Menos de 14 mm quebra com facilidade." }),
          num("waist", "Cintura do cabo", 0.6, 1, { step: 0.05, unit: "", hint: "1 deixa o cabo reto; 0,8 estreita no meio e firma a mão." }),
          bool("fingers", "Marcas de dedo nos lados do cabo"),
          num("thickness", "Espessura", 8, 20, { step: 1 }),
          color("color", "Estilingue"),
          color("nameColor", "Nome (em relevo)"),
        ],
      },
    ],
    build: (ctx, p) => buildSlingshot(ctx, as(p)),
  },
  {
    id: "phoneCase",
    category: "home",
    label: "Capa de celular (TPU)",
    blurb: "Capa em TPU pelas medidas do seu aparelho, com recorte de câmera e botões, desenho e nome nas costas. Só encaixa se as medidas forem as do seu aparelho: imprima antes a peça de teste.",
    icon: Smartphone,
    font: true,
    defaults: DEFAULT_PHONE_CASE,
    liveDefaults: () => fitDefaults({ clearance: "phoneClearance" }), // a folga da capa validada no Kit de testes (#247)
    sections: [
      { title: "Nome", fields: [text("name", "Nome nas costas", 16)] },
      {
        title: "O aparelho (meça o seu)",
        fields: [
          num("phoneL", "Comprimento", 100, 190, { step: 0.1, hint: "Os modelos prontos têm medidas aproximadas e variam por versão: confira com paquímetro e com a ficha do fabricante." }),
          num("phoneW", "Largura", 55, 100, { step: 0.1 }),
          num("phoneT", "Espessura", 5, 14, { step: 0.1, hint: "Sem a capa antiga, na parte mais grossa das laterais (sem a câmera)." }),
          num("cornerR", "Raio dos cantos", 4, 20, { step: 0.5 }),
        ],
      },
      {
        title: "Câmera e botões",
        fields: [
          num("camX", "Câmera: distância da lateral", 0, 60, { step: 0.5, hint: "Visto de trás, a partir do canto de cima à esquerda da capa." }),
          num("camY", "Câmera: distância do topo", 0, 60, { step: 0.5 }),
          num("camW", "Câmera: largura do recorte", 0, 70, { step: 0.5, hint: "0 tira o recorte." }),
          num("camH", "Câmera: altura do recorte", 0, 70, { step: 0.5 }),
          num("camR", "Câmera: cantos", 0, 25, { step: 0.5 }),
          text("buttons", "Recortes dos botões (uma linha cada)", 120, "Lado, posição e comprimento em mm, a posição medida do topo: direita, 40, 22. Lado: direita ou esquerda, como você vê o aparelho de frente."),
        ],
      },
      {
        title: "Capa",
        fields: [
          num("clearance", "Folga em volta do aparelho", 0.05, 0.5, { step: 0.05, hint: "TPU estica: 0,1 a 0,2 mm. Se a peça de teste apertar, aumente de 0,05 em 0,05." }),
          num("wall", "Parede", 1.2, 3, { step: 0.2 }),
          num("floor", "Fundo", 1, 2.5, { step: 0.2 }),
          num("lip", "Borda sobre a tela", 0.8, 3, { step: 0.2 }),
          choice("pattern", "Costas", [["hex", "Hexágonos"], ["cross", "X"], ["smooth", "Lisa"]]),
          choice("print", "Imprimir", [["case", "Capa inteira"], ["test", "Só a peça de teste (25 mm)"]]),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildPhoneCase(ctx, as(p)),
  },
  {
    id: "discBox",
    category: "organize",
    assembledInfo: "Prévia da caixa fechada, com a tampa. Ela não vai para o arquivo: o que imprime está em Mesa (a caixa e a tampa de cabeça para baixo).",
    label: "Caixa de discos",
    blurb: "CDs, DVDs ou Blu-rays em pé, cada um no seu vão, com entalhe para pegar e tampa com o nome em 2 cores. A tampa imprime de cabeça para baixo, sem ponte.",
    icon: Disc3,
    font: true,
    defaults: DEFAULT_DISC_BOX,
    sections: [
      { title: "O que guarda", fields: [choice("kind", "Tipo", Object.entries(DISC_ITEMS).map(([id, i]) => [id, i.label] as const)), num("count", "Quantos", 1, 24, { step: 1, unit: "", hint: "Uma caixa comum de CD ocupa 12 mm de largura; a caixa e a tampa juntas cabem na mesa da A1 até uns 6 (com mais, saem em duas mesas)." })] },
      { title: "Tampa", fields: [text("text", "Nome na tampa", 16)] },
      { title: "Cores", fields: [color("bodyColor", "Caixa"), color("lidColor", "Tampa"), color("textColor", "Nome")] },
    ],
    build: (ctx, p) => buildDiscBox(ctx, as(p)),
  },
  {
    id: "pegboard",
    category: "organize",
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
    category: "organize",
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
];
