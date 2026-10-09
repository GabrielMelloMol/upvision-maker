import { Box, CircleDot, Dices, Egg, Flower2, Goal, Image, LayoutGrid, Layers, Lightbulb, Spline, Stamp, Grid3x3 } from "lucide-react";
import { buildAlphabetCube, DEFAULT_ALPHABET_CUBE } from "../../../geometry/models/alphabetCube";
import { buildDeskOrganizer, DEFAULT_DESK_ORGANIZER } from "../../../geometry/models/deskOrganizer";
import { buildDice, DEFAULT_DICE } from "../../../geometry/models/dice";
import { buildGoalBoard, DEFAULT_GOAL_BOARD } from "../../../geometry/models/goalBoard";
import { buildLedLetter, DEFAULT_LED_LETTER } from "../../../geometry/models/ledLetter";
import { buildOutlineBowl, DEFAULT_OUTLINE_BOWL } from "../../../geometry/models/outlineBowl";
import { buildPhotoHolder, DEFAULT_PHOTO_HOLDER } from "../../../geometry/models/photoHolder";
import { buildReliefTile, DEFAULT_RELIEF_TILE } from "../../../geometry/models/reliefTile";
import { buildScrewCase, DEFAULT_SCREW_CASE } from "../../../geometry/models/screwCase";
import { buildShadowbox, DEFAULT_SHADOWBOX } from "../../../geometry/models/shadowbox";
import { buildStampMold, DEFAULT_STAMP_MOLD } from "../../../geometry/models/stampMold";
import { buildStringArt, DEFAULT_STRING_ART } from "../../../geometry/models/stringArt";
import { buildVase, DEFAULT_VASE } from "../../../geometry/models/vase";
import { as, bool, choice, color, num, profile, text, type ModelDef } from "../fields";

/** Casa, 2ª parte da galeria: letra LED, organizador, cubo, porta-foto, string art, cumbuca, molde, estojo, quadro de metas. */
export const HOME_PROJECT_MODELS: ModelDef[] = [
  {
    id: "ledLetter",
    category: "home",
    label: "Letra caixa LED",
    blurb: "Letra ou palavra oca para fita de LED: face rente, retroiluminada, tampa elevada ou face dupla.",
    icon: Lightbulb,
    font: true,
    art: "Desenho no lugar do texto (opcional)",
    defaults: DEFAULT_LED_LETTER,
    sections: [
      {
        title: "Letra",
        fields: [
          text("text", "Letra ou palavra", 12),
          num("height", "Altura", 60, 600, { step: 1, hint: "Maior que a mesa da impressora, a caixa sai em partes para colar." }),
          choice("style", "Estilo", [["flush", "Face rente"], ["halo", "Retroiluminada"], ["raised", "Tampa elevada"], ["double", "Face dupla"]]),
          text("overlay", "Nome sobreposto na frente (opcional)", 20),
          num("overlayHeight", "Altura do nome", 10, 150, { step: 1 }),
        ],
      },
      {
        title: "Caixa e LED",
        fields: [
          num("depth", "Profundidade", 15, 80, { step: 1 }),
          num("wall", "Parede", 1.2, 4),
          num("stripWidth", "Largura da fita de LED", 3, 20, { step: 0.5 }),
          num("wireHole", "Furo do fio", 2, 10, { step: 0.5 }),
          num("diffuser", "Espessura do difusor", 0.4, 3),
          num("clearance", "Folga do difusor/tampa", 0, 0.6, { step: 0.05 }),
          num("standoff", "Afastamento da parede (retroiluminada)", 5, 40, { step: 1 }),
          color("bodyColor", "Caixa"),
          color("diffuserColor", "Difusor"),
          color("overlayColor", "Nome"),
        ],
      },
    ],
    build: (ctx, p) => buildLedLetter(ctx, as(p)),
  },
  {
    id: "deskOrganizer",
    category: "home",
    label: "Organizador de mesa",
    blurb: "Bandeja com compartimentos em fila ou em grade e o nome em relevo na frente.",
    icon: LayoutGrid,
    font: true,
    fontSection: 1,
    defaults: DEFAULT_DESK_ORGANIZER,
    sections: [
      {
        title: "Compartimentos",
        fields: [
          choice("mode", "Arrumação", [["row", "Em fila"], ["grid", "Grade"]]),
          text("widths", "Larguras em fila (proporções)", 20, "Ex.: 1, 1, 2 = dois estreitos e um largo (até 5)."),
          num("cols", "Colunas (grade)", 1, 8, { step: 1, unit: "" }),
          num("rows", "Linhas (grade)", 1, 6, { step: 1, unit: "" }),
          bool("drain", "Furos de drenagem no fundo"),
        ],
      },
      { title: "Nome", fields: [text("name", "Nome na frente", 20), num("nameHeight", "Altura do nome", 8, 60, { step: 1 }), num("relief", "Relevo", 0.4, 3), color("nameColor", "Nome")] },
      {
        title: "Tamanho",
        fields: [
          num("length", "Comprimento", 60, 250, { step: 1 }),
          num("depth", "Profundidade", 40, 200, { step: 1 }),
          num("height", "Altura", 20, 150, { step: 1 }),
          num("wall", "Parede", 1.2, 4),
          num("floor", "Fundo", 1.2, 5),
          color("bodyColor", "Organizador"),
        ],
      },
    ],
    build: (ctx, p) => buildDeskOrganizer(ctx, as(p)),
  },
  {
    id: "alphabetCube",
    category: "home",
    label: "Cubo alfabeto",
    blurb: "Cubo de cantos arredondados com letra, número ou desenho em cada face, rente e em 2 cores; kit de nome.",
    icon: Box,
    font: true,
    defaults: DEFAULT_ALPHABET_CUBE,
    sections: [
      {
        title: "Faces",
        fields: [
          text("face1", "Frente", 2),
          text("face2", "Direita", 2),
          text("face3", "Trás", 2),
          text("face4", "Esquerda", 2),
          text("face5", "Topo", 2),
          text("face6", "Baixo", 2),
          text("kit", "Kit de nome (opcional)", 12, "Um cubo por letra, com a letra nas 6 faces. Ex.: ANA = 3 cubos."),
        ],
      },
      {
        title: "Tamanho e cores",
        fields: [num("size", "Lado", 20, 80, { step: 1 }), num("radius", "Cantos", 0.5, 10), num("depth", "Profundidade do desenho", 0.6, 3), color("bodyColor", "Cubo"), color("faceColor", "Desenho")],
      },
    ],
    build: (ctx, p) => buildAlphabetCube(ctx, as(p)),
  },
  {
    id: "rpgDice",
    category: "home",
    label: "Dados de RPG",
    blurb: "d4, d6, d8, d10, d12 e d20 com arestas arredondadas e número, bolinhas, texto ou desenho em cada face; conjunto completo numa mesa.",
    icon: Dices,
    font: true,
    fontSection: 1,
    art: "Desenho em cada face (SVG ou imagem; só no conteúdo \"Desenho\")",
    defaults: DEFAULT_DICE,
    sections: [
      {
        title: "Dado",
        fields: [
          choice("die", "Dado", [["d4", "d4"], ["d6", "d6"], ["d8", "d8"], ["d10", "d10"], ["d12", "d12"], ["d20", "d20"], ["set", "Conjunto completo (d4 a d20)"]]),
          num("size", "Tamanho entre faces", 10, 40, { step: 1, hint: "Distância entre faces opostas (no d4, a altura). 16 a 22 mm é o tamanho de um dado comum." }),
          num("rounding", "Arredondar as arestas (%)", 0, 100, { step: 5, hint: "0 deixa as pontas vivas; mais arredondado, menores as faces lisas para o conteúdo." }),
        ],
      },
      {
        title: "Faces",
        fields: [
          choice("content", "O que vai em cada face", [["numbers", "Números"], ["pips", "Bolinhas (só d6)"], ["custom", "Texto ou emoji por face"], ["art", "Desenho enviado"]]),
          text("labels", "Texto de cada face", 120, "Separe por vírgula. Ex.: Cara, Coroa, ou ⚔️, 🛡️, 🧙. Falta rótulo? Repito os que você escreveu."),
          bool("d10Zero", "d10 de 0 a 9 (tradicional)"),
          bool("underline", "Sublinhar o 6 e o 9"),
        ],
      },
      {
        title: "Gravação e cores",
        fields: [
          choice("style", "Como fica o número", [["flush", "Rente, em 2 cores"], ["engraved", "Gravado fundo, 1 cor"], ["raised", "Em relevo, 2 cores"]]),
          num("depth", "Profundidade ou altura", 0.4, 1.5, { step: 0.1 }),
          color("bodyColor", "Dado"),
          color("faceColor", "Número"),
        ],
      },
    ],
    build: (ctx, p) => buildDice(ctx, as(p)),
  },
  {
    id: "photoHolder",
    category: "home",
    label: "Porta-foto com texto",
    blurb: "Base com fenda para foto 10×15, polaroid ou medida livre e texto em relevo noutra cor.",
    icon: Image,
    font: true,
    defaults: DEFAULT_PHOTO_HOLDER,
    sections: [
      {
        title: "Foto e texto",
        fields: [
          choice("photo", "Foto", [["15x10", "15×10 deitada"], ["10x15", "10×15 em pé"], ["polaroid", "Polaroid"], ["custom", "Medida livre"]]),
          num("photoWidth", "Largura da foto (medida livre)", 30, 230, { step: 1 }),
          text("text", "Texto na frente", 30),
          num("textHeight", "Altura do texto", 5, 40, { step: 1 }),
          num("spacing", "Espaço entre letras", 0, 10, { step: 0.5 }),
        ],
      },
      {
        title: "Base e cores",
        fields: [
          num("depth", "Profundidade", 20, 80, { step: 1 }),
          num("height", "Altura", 8, 40, { step: 1 }),
          num("tilt", "Inclinação da foto", 0, 20, { step: 1, unit: "°" }),
          num("photoThickness", "Espessura da foto", 0.1, 3, { step: 0.05 }),
          num("clearance", "Folga da fenda", 0.2, 2, { step: 0.1 }),
          num("textThickness", "Espessura do texto", 1, 5),
          color("baseColor", "Base"),
          color("textColor", "Texto"),
        ],
      },
    ],
    build: (ctx, p) => buildPhotoHolder(ctx, as(p)),
  },
  {
    id: "stringArt",
    category: "home",
    label: "String art",
    blurb: "Moldura com texto e fios impressos (radial, vertical ou cruzado), ou tábua com furos para pregos.",
    icon: Spline,
    font: true,
    art: "Desenho da moldura (formato \"Desenho\")",
    defaults: DEFAULT_STRING_ART,
    sections: [
      {
        title: "Moldura e texto",
        fields: [
          choice("frame", "Moldura", [["heart", "Coração"], ["rect", "Retângulo"], ["circle", "Círculo"], ["art", "Desenho"]]),
          text("line1", "Linha 1", 16),
          text("line2", "Linha 2 (opcional)", 16),
          choice("mode", "Tipo", [["print", "Fios impressos"], ["nails", "Tábua para pregos"]]),
          choice("pattern", "Padrão dos fios", [["radial", "Radial"], ["vertical", "Vertical"], ["crossed", "Cruzado"]]),
        ],
      },
      {
        title: "Tamanho e cores",
        fields: [
          num("size", "Tamanho", 60, 250, { step: 1 }),
          num("frameWidth", "Largura da moldura", 2, 12),
          num("spacing", "Espaço entre fios", 1.5, 12, { step: 0.5 }),
          num("threadWidth", "Espessura do fio", 0.8, 2, { step: 0.05, hint: "Mínimo de 2 larguras de linha (0,84 mm com bico 0,4)." }),
          num("height", "Altura da moldura", 1.5, 8),
          num("threadHeight", "Altura dos fios", 0.6, 4),
          bool("backing", "Fundo fino"),
          color("frameColor", "Moldura"),
          color("textColor", "Texto"),
          color("threadColor", "Fios"),
        ],
      },
    ],
    build: (ctx, p) => buildStringArt(ctx, as(p)),
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
    id: "reliefTile",
    category: "home",
    label: "Azulejo em relevo e molde de gesso",
    blurb: "Padrão ou desenho que se repete sem emenda numa placa; gere também o molde para fazer azulejos de gesso.",
    icon: Grid3x3,
    art: "Desenho para repetir (opcional)",
    defaults: DEFAULT_RELIEF_TILE,
    sections: [
      {
        title: "Azulejo",
        fields: [
          choice("kind", "Padrão", [["hexagons", "Hexágonos"], ["waves", "Ondas"], ["stripes", "Listras"], ["dots", "Pontos"], ["checker", "Xadrez"], ["art", "Desenho"]]),
          num("width", "Largura", 30, 250, { step: 1 }),
          num("height", "Altura", 30, 250, { step: 1 }),
          num("pitch", "Tamanho do padrão", 4, 40, { step: 1, hint: "Ajusta de leve para o padrão caber inteiro e emendar com o vizinho." }),
          num("base", "Espessura da placa", 2, 10, { step: 0.5 }),
          num("depth", "Altura do relevo", 0.6, 6, { step: 0.2 }),
          choice("output", "Gerar", [["tile", "Azulejo"], ["mold", "Molde"], ["both", "Os dois"], ["grid", "3×3"]]),
        ],
      },
      {
        title: "Molde",
        fields: [
          num("wall", "Parede", 4, 20, { step: 1 }),
          num("floor", "Fundo", 2, 10, { step: 0.5 }),
          num("draft", "Chanfro de saída", 0, 4, { step: 0.5, hint: "Alarga a boca da cavidade para o gesso sair." }),
          color("color", "Cor do azulejo"),
          color("moldColor", "Cor do molde"),
        ],
      },
    ],
    build: (ctx, p) => buildReliefTile(ctx, as(p)),
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
  {
    id: "goalBoard",
    category: "home",
    label: "Quadro de metas",
    blurb: "Placa de mesa com números para riscar conforme a meta avança: economia, dias até um evento.",
    icon: Goal,
    font: true,
    defaults: DEFAULT_GOAL_BOARD,
    sections: [
      {
        title: "Meta",
        fields: [
          text("title", "Título", 30),
          num("target", "Meta", 1, 1000000, { step: 1, unit: "" }),
          num("step", "De quanto em quanto", 1, 100000, { step: 1, unit: "", hint: "O quadro mostra até 100 números." }),
          text("prefix", "Antes do número (ex.: R$)", 6),
          text("suffix", "Depois do número (ex.: K, dias)", 8),
          bool("countdown", "Contagem regressiva (do maior para o menor)"),
        ],
      },
      {
        title: "Placa e cores",
        fields: [
          num("width", "Largura", 80, 250, { step: 1 }),
          num("thickness", "Espessura", 2, 6),
          num("relief", "Relevo", 0.4, 2),
          bool("grid", "Linhas entre os números"),
          bool("stand", "Suporte de mesa"),
          color("plateColor", "Placa"),
          color("textColor", "Números e título"),
        ],
      },
    ],
    build: (ctx, p) => buildGoalBoard(ctx, as(p)),
  },
  {
    id: "vase",
    category: "home",
    label: "Vaso paramétrico",
    blurb: "Perfil por pontos, seção redonda, poligonal ou estrela, torção e ondulação; sai pronto para o modo vaso.",
    icon: Flower2,
    defaults: DEFAULT_VASE,
    sections: [
      { title: "Perfil", fields: [profile("profile", "Perfil (meia silhueta)", 5, 120), num("height", "Altura", 60, 250, { step: 1, hint: "Até 250 mm: a altura de impressão da A1, P1 e X1 é 256." })] },
      {
        title: "Forma",
        fields: [
          choice("shape", "Seção", [["circle", "Redonda"], ["polygon", "Polígono"], ["star", "Estrela"]]),
          num("sides", "Lados ou pontas", 3, 12, { step: 1, unit: "" }),
          num("starDepth", "Fundo das pontas (estrela)", 0.05, 0.5, { step: 0.05, unit: "" }),
          num("twist", "Torção", 0, 360, { step: 5, unit: "°" }),
          choice("wave", "Ondulação", [["none", "Nenhuma"], ["radial", "Em volta"], ["vertical", "Na altura"]]),
          num("waveAmp", "Amplitude da onda", 0.5, 10, { step: 0.5 }),
          num("waves", "Número de ondas", 1, 24, { step: 1, unit: "" }),
        ],
      },
      {
        title: "Impressão e cor",
        fields: [
          choice("mode", "Modo", [["spiral", "Modo vaso (espiral)"], ["walls", "Com paredes"]]),
          num("wall", "Parede (com paredes)", 0.8, 5),
          num("bottom", "Fundo (com paredes)", 0.8, 6),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildVase(ctx, as(p)),
  },
  {
    id: "shadowbox",
    category: "home",
    label: "Quadro em camadas (shadowbox)",
    blurb: "A imagem colorida vira de 2 a 8 placas recortadas, uma por cor, que empilham com profundidade. Cada placa é de uma cor só e vem numerada.",
    icon: Layers,
    artColors: true,
    art: "Imagem colorida (cada cor vira uma camada; 3 a 8 cores funcionam melhor)",
    defaults: DEFAULT_SHADOWBOX,
    sections: [
      {
        title: "Camadas",
        fields: [
          num("width", "Largura da imagem", 60, 200, { step: 1 }),
          choice("order", "Cor no fundo", [["dark-back", "A mais escura"], ["light-back", "A mais clara"], ["image", "Ordem da imagem"]]),
          num("gap", "Profundidade entre camadas", 1, 10, { hint: "Altura da borda que separa uma placa da seguinte." }),
        ],
      },
      {
        title: "Placas",
        fields: [
          num("plate", "Espessura da placa", 0.8, 3),
          num("border", "Largura da moldura", 4, 20),
          bool("led", "Fundo fino para luz de LED"),
        ],
      },
    ],
    build: (ctx, p) => buildShadowbox(ctx, as(p)),
  },
];
