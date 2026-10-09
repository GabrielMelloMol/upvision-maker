import { Award, Cake, Disc3, Magnet, Shirt, Layers, Medal, Snowflake, Sparkles, Trophy, Type } from "lucide-react";
import { buildAdaptiveMedal, DEFAULT_ADAPTIVE_MEDAL } from "../../../geometry/models/adaptiveMedal";
import { buildAdaptiveTrophy, DEFAULT_ADAPTIVE_TROPHY } from "../../../geometry/models/adaptiveTrophy";
import { buildCakeTopper, DEFAULT_CAKE_TOPPER } from "../../../geometry/models/cakeTopper";
import { buildFridgeMagnet, DEFAULT_FRIDGE_MAGNET } from "../../../geometry/models/fridgeMagnet";
import { buildLayeredSign, DEFAULT_LAYERED_SIGN } from "../../../geometry/models/layeredSign";
import { buildOrnamentSpinner, DEFAULT_ORNAMENT_SPINNER } from "../../../geometry/models/ornamentSpinner";
import { buildShirtPrint, DEFAULT_SHIRT_PRINT } from "../../../geometry/models/shirtPrint";
import { buildSnowflake, DEFAULT_SNOWFLAKE } from "../../../geometry/models/snowflake";
import { buildTrophy, DEFAULT_TROPHY } from "../../../geometry/models/trophy";
import { buildWallLetters, DEFAULT_WALL_LETTERS } from "../../../geometry/models/wallLetters";
import { buildWindowFrame, DEFAULT_WINDOW_FRAME } from "../../../geometry/models/windowFrame";
import { as, bool, choice, color, num, signLine, text, textureFields, type ModelDef } from "../fields";

/** Modelos prontos da categoria Festa e esporte. */
export const PARTY_MODELS: ModelDef[] = [
  {
    id: "fridgeMagnet",
    category: "party",
    label: "Ímã de geladeira",
    blurb: "Nome ou desenho em relevo no contorno da arte, com 1 a 5 bolsos para ímãs de neodímio e pausa para inserir.",
    icon: Magnet,
    font: true,
    art: "Desenho do ímã (opcional)",
    defaults: DEFAULT_FRIDGE_MAGNET,
    sections: [
      { title: "Texto", fields: [text("text", "Texto (sem desenho)", 16)] },
      {
        title: "Ímãs e impressão",
        fields: [
          num("count", "Quantidade de ímãs", 1, 5, { step: 1, unit: "", hint: "Se não couberem todos neste tamanho, o app coloca os que cabem e avisa." }),
          num("magnetDiameter", "Diâmetro do ímã", 6, 25, { step: 0.5, hint: "Disco de neodímio comum: 10 mm. A folga de 0,4 mm já vem somada." }),
          num("magnetHeight", "Altura do ímã", 1, 6, { step: 0.5, hint: "Disco comum: 2 a 3 mm." }),
          num("layerHeight", "Altura de camada", 0.08, 0.32, { step: 0.02, hint: "A mesma do fatiador: define a camada da pausa." }),
        ],
      },
      { title: "Tamanho e cores", fields: [num("width", "Largura da arte", 30, 150, { step: 1 }), num("margin", "Contorno do corpo", 2, 10, { step: 0.5 }), num("relief", "Relevo", 0.4, 2), color("bodyColor", "Corpo"), color("artColor", "Arte (1 cor)")] },
    ],
    build: (ctx, p) => buildFridgeMagnet(ctx, as({ ...p, count: Math.round(Number(p.count)) })),
  },
  {
    id: "shirtPrint",
    category: "party",
    label: "Estampa de camisa",
    blurb: "Nome ou desenho em camada fina (0,3 mm) para passar a ferro no tecido. Sai espelhada, com as instruções de impressão e de colagem.",
    icon: Shirt,
    font: true,
    art: "Desenho da estampa (opcional)",
    defaults: DEFAULT_SHIRT_PRINT,
    sections: [
      { title: "Texto", fields: [text("text", "Texto (sem desenho)", 20)] },
      {
        title: "Tamanho e espessura",
        fields: [
          num("width", "Largura", 20, 200, { step: 1 }),
          num("layers", "Número de camadas", 2, 4, { step: 1, unit: "", hint: "Espessura = camadas × altura da camada (0,3 mm é um bom começo)." }),
          num("layerHeight", "Altura de camada", 0.1, 0.3, { step: 0.01, hint: "A mesma do fatiador." }),
          bool("mirror", "Espelhar (para colar na camisa)"),
        ],
      },
      {
        title: "Fundo e cores",
        fields: [bool("patch", "Fundo contínuo em volta (adesivo numa peça só)"), num("margin", "Largura do fundo", 1.5, 10, { step: 0.5 }), color("color", "Estampa (1 cor)"), color("patchColor", "Fundo")],
      },
    ],
    build: (ctx, p) => buildShirtPrint(ctx, as(p)),
  },
  {
    id: "cake",
    category: "party",
    label: "Topo de bolo",
    blurb: "Nome e frase em relevo, fundo contornado e palitos.",
    icon: Cake,
    font: true,
    defaults: DEFAULT_CAKE_TOPPER,
    sections: [
      { title: "Texto", fields: [text("line1", "Linha principal", 20), text("line2", "Segunda linha (opcional)", 30)] },
      { title: "Tamanho e cores", fields: [num("width", "Largura", 60, 250, { step: 1 }), { k: "stakes", kind: "choice", label: "Palitos", options: [["1", "1"], ["2", "2"]] }, num("stakeLength", "Comprimento do palito", 30, 120, { step: 1 }), num("thickness", "Espessura", 2, 6), num("relief", "Relevo", 0.4, 3), num("border", "Borda", 1.5, 8), color("baseColor", "Fundo"), color("textColor", "Texto")] },
    ],
    build: (ctx, p) => buildCakeTopper(ctx, as({ ...p, stakes: Number(p.stakes) })),
  },
  {
    id: "trophy",
    category: "party",
    label: "Troféu",
    blurb: "Placa com texto e imagem que encaixa numa base com degrau.",
    icon: Trophy,
    font: true,
    art: "Imagem no centro (opcional)",
    defaults: DEFAULT_TROPHY,
    sections: [
      { title: "Textos", fields: [text("text", "Texto na placa", 20), text("baseText", "Texto na base (opcional)", 24)] },
      { title: "Tamanho e cores", fields: [{ k: "shape", kind: "choice", label: "Formato", options: [["star", "Estrela"], ["circle", "Redondo"], ["shield", "Escudo"], ["hexagon", "Hexágono"]] }, num("size", "Tamanho", 40, 180, { step: 1 }), num("thickness", "Espessura", 2.5, 8), num("relief", "Relevo", 0.4, 3), color("plateColor", "Placa"), color("accentColor", "Borda e textos"), color("artColor", "Imagem"), color("baseColor", "Base")] },
    ],
    build: (ctx, p) => buildTrophy(ctx, as(p)),
  },
  {
    id: "adaptiveMedal",
    category: "party",
    label: "Medalha adaptável",
    blurb: "Medalha no contorno do desenho, reforçada, com alça para a fita.",
    icon: Medal,
    art: "Desenho da medalha (SVG ou imagem; colorido vira várias cores)",
    defaults: DEFAULT_ADAPTIVE_MEDAL,
    sections: [{ title: "Tamanho e cores", fields: [num("width", "Largura da arte", 30, 120, { step: 1 }), num("thickness", "Corpo", 4, 10), num("border", "Borda", 1.5, 8), num("relief", "Relevo", 0.4, 3), num("ribbon", "Largura da fita", 10, 40, { step: 1 }), color("bodyColor", "Corpo"), color("artColor", "Arte (1 cor)")] }],
    build: (ctx, p) => buildAdaptiveMedal(ctx, as(p)),
  },
  {
    id: "trophyElegant",
    category: "party",
    label: "Troféu elegante",
    blurb: "Medalhão redondo com a arte, sobre base com duas linhas de texto.",
    icon: Award,
    font: true,
    art: "Imagem do medalhão (opcional)",
    defaults: { ...DEFAULT_TROPHY, shape: "circle", size: 70, text: "", baseText: "CAMPEONATO 2026", baseText2: "1º LUGAR" },
    sections: [
      { title: "Textos", fields: [text("text", "Texto no medalhão (opcional)", 20), text("baseText", "Base: linha de cima", 26), text("baseText2", "Base: linha de baixo", 26)] },
      { title: "Tamanho e cores", fields: [num("size", "Medalhão", 40, 150, { step: 1 }), num("thickness", "Espessura", 2.5, 8), num("relief", "Relevo", 0.4, 3), color("plateColor", "Medalhão"), color("accentColor", "Borda e textos"), color("artColor", "Imagem"), color("baseColor", "Base")] },
    ],
    build: (ctx, p) => buildTrophy(ctx, as(p)),
  },
  {
    id: "adaptiveTrophy",
    category: "party",
    label: "Troféu adaptável",
    blurb: "Corpo no contorno do desenho, base original (degraus) ou compacta.",
    icon: Trophy,
    font: true,
    art: "Desenho do troféu (SVG ou imagem)",
    defaults: DEFAULT_ADAPTIVE_TROPHY,
    sections: [
      { title: "Base", fields: [text("baseText", "Base: linha de cima", 26), text("baseText2", "Base: linha de baixo (opcional)", 26), bool("compact", "Base compacta (120 × 55 mm)")] },
      { title: "Tamanho e cores", fields: [num("height", "Altura da arte", 40, 200, { step: 1 }), num("thickness", "Corpo", 4, 10), num("border", "Borda", 1.5, 8), num("relief", "Relevo", 0.4, 3), color("bodyColor", "Corpo"), color("artColor", "Arte (1 cor)"), color("baseColor", "Base"), color("textColor", "Texto da base")] },
    ],
    build: (ctx, p) => buildAdaptiveTrophy(ctx, as(p)),
  },
  {
    id: "snowflake",
    category: "party",
    label: "Floco de neve com nome",
    blurb: "Enfeite de Natal: cada número de desenho gera um floco diferente.",
    icon: Snowflake,
    font: true,
    defaults: DEFAULT_SNOWFLAKE,
    sections: [
      { title: "Nome", fields: [text("name", "Nome", 12)] },
      { title: "Floco e cores", fields: [num("seed", "Desenho nº", 1, 999, { step: 1, hint: "Troque o número para ver outro floco." }), num("arms", "Braços", 5, 8, { step: 1 }), num("diameter", "Diâmetro", 50, 150, { step: 1 }), num("thickness", "Espessura", 1.6, 5), num("relief", "Relevo do nome", 0.4, 2), color("flakeColor", "Floco"), color("nameColor", "Nome")] },
    ],
    build: (ctx, p) => buildSnowflake(ctx, as(p)),
  },
  {
    id: "layeredSign",
    category: "party",
    label: "Letreiro em camadas",
    blurb: "Até 4 linhas sobrepostas, cada uma na sua cor, com imagem, enfeite e base contornada.",
    icon: Layers,
    art: "Imagem ao lado do texto (opcional)",
    defaults: DEFAULT_LAYERED_SIGN,
    sections: [
      signLine(1),
      signLine(2),
      signLine(3),
      signLine(4),
      {
        title: "Camadas e enfeites",
        fields: [
          num("overlap", "Sobreposição das linhas", 0, 0.8, { step: 0.05, unit: "", hint: "Fração da altura da linha que sobe sobre a de cima." }),
          num("relief", "Relevo", 0.4, 4),
          num("layerStep", "Degrau entre linhas", 0, 3),
          bool("fillHoles", "Preencher furos das letras"),
          num("artHeight", "Altura da imagem", 10, 150, { step: 1 }),
          color("artColor", "Imagem (1 cor)"),
          text("qr", "QR ao lado (link, opcional)", 200),
          num("qrSize", "Tamanho do QR", 15, 80, { step: 1 }),
          color("qrColor", "QR"),
          choice("ornament", "Enfeite", [["none", "Nenhum"], ["heart", "Coração"], ["star", "Estrela"]]),
          num("ornamentSize", "Tamanho do enfeite", 6, 60, { step: 1 }),
          color("ornamentColor", "Enfeite"),
        ],
      },
      {
        title: "Base",
        fields: [
          num("border", "Borda", 1, 15, { step: 0.5 }),
          num("baseThickness", "Espessura", 1.5, 8),
          choice("mount", "Fixação", [["stand", "Suporte de mesa"], ["hang", "Furos para pendurar"], ["none", "Nenhuma"]]),
          ...textureFields,
          color("baseColor", "Base"),
        ],
      },
    ],
    build: (ctx, p) => buildLayeredSign(ctx, as(p)),
  },
  {
    id: "wallLetters",
    category: "party",
    label: "Letras para parede",
    blurb: "Uma peça por letra, em 1 a 3 camadas, divididas com pino quando passam da mesa, e gabarito para colar.",
    icon: Type,
    font: true,
    defaults: { ...DEFAULT_WALL_LETTERS, layers: "2" },
    sections: [
      {
        title: "Texto",
        fields: [text("text", "Texto", 20), num("height", "Altura na parede", 40, 1000, { step: 5, hint: "Letras maiores que a mesa da impressora saem em partes." }), bool("template", "Gabarito de posicionamento")],
      },
      {
        title: "Camadas e cores",
        fields: [
          choice("layers", "Camadas", [["1", "1"], ["2", "2"], ["3", "3"]]),
          num("offset", "Sobra de cada camada", 1, 20, { step: 0.5 }),
          num("thickness", "Espessura da base", 3, 20),
          num("layerThickness", "Espessura das camadas de cima", 1, 10),
          color("color1", "Camada de baixo"),
          color("color2", "Camada do meio"),
          color("color3", "Camada de cima"),
        ],
      },
    ],
    build: (ctx, p) => buildWallLetters(ctx, as({ ...p, layers: Number(p.layers) })),
  },
  {
    id: "windowFrame",
    category: "party",
    label: "Peça com janela (shaker)",
    blurb: "Moldura com câmara de glitter e ranhura para acetato, ou aro com pausa para tecido; topo de bolo, em pé ou pendurar.",
    icon: Sparkles,
    font: true,
    art: "Desenho da moldura (formato \"Desenho\")",
    defaults: DEFAULT_WINDOW_FRAME,
    sections: [
      {
        title: "Janela",
        fields: [
          choice("kind", "Tipo", [["shaker", "Glitter + acetato"], ["acetate", "Só acetato"], ["fabric", "Tecido (tule)"]]),
          choice("shape", "Formato", [["circle", "Redondo"], ["rect", "Retangular"], ["text", "Contorno de texto"], ["art", "Desenho"]]),
          text("shapeText", "Texto do contorno", 6, "Para o formato \"Contorno de texto\" (ex.: um número)."),
          text("name", "Nome (peça à parte, cola na frente)", 20),
          num("nameHeight", "Altura do nome", 6, 40, { step: 1 }),
          choice("mount", "Saída", [["topper", "Topo de bolo"], ["stand", "Em pé (suporte)"], ["hang", "Pendurar"]]),
        ],
      },
      {
        title: "Medidas e impressão",
        fields: [
          num("size", "Tamanho", 30, 200, { step: 1 }),
          num("wall", "Parede", 2, 10),
          num("back", "Fundo", 0.8, 4),
          num("chamber", "Câmara do glitter", 1, 10),
          num("sheet", "Espessura do acetato", 0.1, 0.8, { step: 0.05 }),
          num("clearance", "Folga da ranhura", 0.1, 0.5, { step: 0.05 }),
          num("lip", "Aba sobre a folha", 0.6, 3),
          num("fabricAt", "Altura da pausa do tecido", 0.4, 4),
          num("relief", "Espessura do nome", 0.6, 4),
          num("layerHeight", "Altura de camada", 0.08, 0.32, { step: 0.02, hint: "A mesma do fatiador: define a camada da pausa." }),
          color("frameColor", "Moldura"),
          color("textColor", "Nome"),
        ],
      },
    ],
    build: (ctx, p) => buildWindowFrame(ctx, as(p)),
  },
  {
    id: "ornamentSpinner",
    category: "party",
    label: "Enfeite giratório",
    blurb: "Disco que gira dentro do aro, impresso já montado, com gancho de pendurar, texto curvo ou sua arte e enfeites no aro. Face da arte para baixo.",
    icon: Disc3,
    font: true,
    art: "Arte do disco (opcional; sem ela, vale o texto curvo)",
    defaults: DEFAULT_ORNAMENT_SPINNER,
    sections: [
      { title: "Texto", fields: [text("text", "Texto curvo no disco (sem arte)", 24)] },
      {
        title: "Aro e enfeites",
        fields: [
          choice("trim", "Enfeite do aro", [["star", "Estrelas"], ["dot", "Bolinhas"], ["bell", "Sinos"], ["none", "Sem enfeites"]]),
          num("trimCount", "Quantidade", 3, 12, { step: 1 }),
          num("trimSize", "Tamanho do enfeite", 4, 12, { step: 1 }),
        ],
      },
      {
        title: "Tamanho e cores",
        fields: [
          num("diameter", "Diâmetro do aro", 40, 90, { step: 1 }),
          num("thickness", "Espessura", 4, 8),
          num("gap", "Folga", 0.3, 0.8, { step: 0.05, hint: "Folga entre o disco e o aro; menor prende, maior balança." }),
          num("inlay", "Profundidade da arte", 0.4, 2, { step: 0.1 }),
          color("frameColor", "Aro"),
          color("diskColor", "Disco"),
          color("artColor", "Arte ou texto"),
        ],
      },
    ],
    build: (ctx, p) => buildOrnamentSpinner(ctx, as(p)),
  },
];
