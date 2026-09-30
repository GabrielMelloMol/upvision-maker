import { Bookmark, Box, CaseUpper, CircleDot, Egg, Gem, Goal, Image, KeySquare, Lamp, LayoutGrid, Lightbulb, PencilRuler, PenTool, Puzzle, Spline, Stamp, WholeWord } from "lucide-react";
import { buildAlphabetCube, DEFAULT_ALPHABET_CUBE } from "../../../geometry/models/alphabetCube";
import { buildBigLetter, DEFAULT_BIG_LETTER } from "../../../geometry/models/bigLetter";
import { buildBookmark, DEFAULT_BOOKMARK } from "../../../geometry/models/bookmark";
import { buildDeskOrganizer, DEFAULT_DESK_ORGANIZER } from "../../../geometry/models/deskOrganizer";
import { buildGoalBoard, DEFAULT_GOAL_BOARD } from "../../../geometry/models/goalBoard";
import { buildKeyHolder, DEFAULT_KEY_HOLDER } from "../../../geometry/models/keyHolder";
import { buildLamp, DEFAULT_LAMP } from "../../../geometry/models/lamp";
import { buildLedLetter, DEFAULT_LED_LETTER } from "../../../geometry/models/ledLetter";
import { buildLineArtStand, DEFAULT_LINE_ART } from "../../../geometry/models/lineArtStand";
import { buildNfcJewelry, DEFAULT_NFC_JEWELRY } from "../../../geometry/models/nfcJewelry";
import { buildOutlineBowl, DEFAULT_OUTLINE_BOWL } from "../../../geometry/models/outlineBowl";
import { buildPenHolder, DEFAULT_PEN_HOLDER } from "../../../geometry/models/penHolder";
import { buildPhotoHolder, DEFAULT_PHOTO_HOLDER } from "../../../geometry/models/photoHolder";
import { buildPuzzle, DEFAULT_PUZZLE } from "../../../geometry/models/puzzle";
import { buildScrewCase, DEFAULT_SCREW_CASE } from "../../../geometry/models/screwCase";
import { buildStampMold, DEFAULT_STAMP_MOLD } from "../../../geometry/models/stampMold";
import { buildStringArt, DEFAULT_STRING_ART } from "../../../geometry/models/stringArt";
import { buildWordDecor, DEFAULT_WORD_DECOR } from "../../../geometry/models/wordDecor";
import { as, bool, choice, color, font, nfcFields, num, text, textureFields, type ModelDef } from "../fields";

/** Modelos prontos da categoria Casa. */
export const HOME_MODELS: ModelDef[] = [
  {
    id: "bookmark",
    category: "home",
    label: "Marca-página",
    blurb: "Tira com furo para cordão, texto ao longo e desenho no topo.",
    icon: Bookmark,
    font: true,
    art: "Desenho no topo (opcional)",
    defaults: DEFAULT_BOOKMARK,
    sections: [
      {
        title: "Texto",
        fields: [
          text("text", "Texto", 30),
          { k: "mode", kind: "choice", label: "Formato", options: [["strip", "Tira com texto"], ["side", "Nome na lateral"]] },
          num("nameHeight", "Altura do nome (lateral)", 6, 30, { step: 1, hint: "Encolhe sozinho para caber no comprimento." }),
          num("spacing", "Espaço entre letras (lateral)", 0, 6, { step: 0.5 }),
        ],
      },
      { title: "Tamanho e cores", fields: [num("length", "Comprimento", 80, 220, { step: 1 }), num("width", "Largura", 20, 70, { step: 1 }), num("thickness", "Espessura", 1, 4), num("relief", "Relevo", 0.4, 2), { k: "hole", kind: "bool", label: "Furo para cordão" }, color("baseColor", "Base"), color("textColor", "Texto")] },
    ],
    build: (ctx, p) => buildBookmark(ctx, as(p)),
  },
  {
    id: "pen",
    category: "home",
    label: "Porta-caneta",
    blurb: "Copo redondo, sextavado ou quadrado com nome em relevo.",
    icon: PencilRuler,
    font: true,
    defaults: DEFAULT_PEN_HOLDER,
    sections: [
      { title: "Texto", fields: [text("text", "Nome na frente", 20)] },
      { title: "Tamanho e cores", fields: [{ k: "shape", kind: "choice", label: "Formato", options: [["round", "Redondo"], ["hex", "Sextavado"], ["square", "Quadrado"]] }, num("diameter", "Largura", 40, 150, { step: 1 }), num("height", "Altura", 40, 200, { step: 1 }), num("wall", "Parede", 1.2, 5), num("floor", "Fundo", 1, 5), num("relief", "Relevo", 0.4, 3), color("bodyColor", "Copo"), color("textColor", "Texto")] },
    ],
    build: (ctx, p) => buildPenHolder(ctx, as(p)),
  },
  {
    id: "wordDecor",
    category: "home",
    label: "Decoração de palavras",
    blurb: "Palavra grossa em pé com outra palavra encaixada na frente (ex.: AMOR + Família).",
    icon: WholeWord,
    font: true,
    defaults: DEFAULT_WORD_DECOR,
    sections: [
      { title: "Palavras", fields: [text("base", "Palavra base", 12), text("word", "Palavra de encaixe", 16)] },
      {
        title: "Tamanho e cores",
        fields: [
          num("baseHeight", "Altura da base", 25, 120, { step: 1 }),
          num("baseThickness", "Espessura da base", 5, 20),
          num("wordHeight", "Altura da palavra", 10, 80, { step: 1 }),
          num("wordThickness", "Espessura da palavra", 1.6, 6),
          num("recess", "Rebaixo do encaixe", 0.4, 3),
          num("clearance", "Folga do encaixe", 0, 0.6, { step: 0.05 }),
          color("baseColor", "Base"),
          color("wordColor", "Palavra"),
        ],
      },
    ],
    build: (ctx, p) => buildWordDecor(ctx, as(p)),
  },
  {
    id: "nfcJewelry",
    category: "home",
    label: "Porta-joia NFC",
    blurb: "Pote redondo com tampa de anilha, tag NFC na tampa (pausa).",
    icon: Gem,
    font: true,
    defaults: DEFAULT_NFC_JEWELRY,
    sections: [
      { title: "Tampa", fields: [text("text", "Texto de cima", 16), text("text2", "Texto de baixo (opcional)", 16)] },
      { title: "Tag e impressão", fields: nfcFields },
      { title: "Tamanho e cores", fields: [num("diameter", "Diâmetro", 40, 100, { step: 1 }), num("height", "Altura do pote", 10, 60, { step: 1 }), num("clearance", "Folga da tampa", 0.1, 0.6, { step: 0.05 }), num("relief", "Relevo", 0.4, 2), color("bodyColor", "Pote e tampa"), color("textColor", "Anilha e texto")] },
    ],
    build: (ctx, p) => buildNfcJewelry(ctx, as(p)),
  },
  {
    id: "keyHolder",
    category: "home",
    label: "Porta-chave de parede",
    blurb: "Painel no contorno do desenho com ganchos e furos de parafuso.",
    icon: KeySquare,
    art: "Desenho do painel (SVG ou imagem)",
    defaults: DEFAULT_KEY_HOLDER,
    sections: [{ title: "Tamanho e cores", fields: [num("width", "Largura", 100, 230, { step: 1 }), num("hooks", "Ganchos", 2, 8, { step: 1 }), num("thickness", "Painel", 3, 8), num("hookDepth", "Profundidade do gancho", 8, 20), num("relief", "Relevo", 0.4, 3), color("panelColor", "Painel"), color("artColor", "Arte (1 cor)")] }],
    build: (ctx, p) => buildKeyHolder(ctx, as({ ...p, hooks: Math.round(Number(p.hooks)) })),
  },
  {
    id: "lamp",
    category: "home",
    label: "Luminária",
    blurb: "Caixa de luz no formato do texto ou desenho, com difusor e tampa.",
    icon: Lamp,
    font: true,
    art: "Desenho (opcional; sem ele, usa o texto)",
    defaults: DEFAULT_LAMP,
    sections: [
      { title: "Texto", fields: [text("text", "Texto (sem desenho)", 12)] },
      { title: "Tamanho e cores", fields: [num("width", "Largura", 80, 240, { step: 1 }), num("depth", "Profundidade", 15, 40, { step: 1 }), num("margin", "Margem", 4, 20), num("clearance", "Folga da tampa", 0.1, 0.5, { step: 0.05 }), color("frameColor", "Caixa"), color("diffuserColor", "Difusor (branco)")] },
    ],
    build: (ctx, p) => buildLamp(ctx, as(p)),
  },
  {
    id: "lineArt",
    category: "home",
    label: "Desenho em pé",
    blurb: "Line art vira uma placa vazada em pé, com base e texto. Avisa se sobrar traço solto.",
    icon: PenTool,
    font: true,
    art: "Desenho de traço (SVG ou imagem; sem ele, um coração de exemplo)",
    defaults: DEFAULT_LINE_ART,
    sections: [
      { title: "Base", fields: [text("baseText", "Texto na base", 26)] },
      { title: "Tamanho e cores", fields: [num("height", "Altura do desenho", 50, 220, { step: 1 }), num("stroke", "Engrossar o traço", 0, 1.5, { step: 0.1, hint: "Liga traços quase encostados e deixa o desenho mais firme." }), num("thickness", "Espessura", 2.5, 8), color("artColor", "Desenho"), color("baseColor", "Base"), color("textColor", "Texto da base")] },
    ],
    build: (ctx, p) => buildLineArtStand(ctx, as(p)),
  },
  {
    id: "bigLetter",
    category: "home",
    label: "Letra grande",
    blurb: "Inicial grande com o nome encaixado, rebaixado ou em relevo; borda para resina ou fundo para EVA.",
    icon: CaseUpper,
    font: true,
    art: "Desenho no lugar da letra (opcional)",
    defaults: DEFAULT_BIG_LETTER,
    sections: [
      {
        title: "Letra e nome",
        fields: [
          text("letter", "Letra", 2, "Um caractere. Ou envie um desenho."),
          font("letterFont", "Fonte da letra", "letter"),
          text("name", "Nome", 20),
          choice("nameMode", "Nome", [["inlay", "Encaixado"], ["sunken", "Rebaixado"], ["raised", "Em relevo"]]),
          num("nameHeight", "Altura do nome", 8, 120, { step: 1 }),
          num("nameAngle", "Rotação do nome", -90, 90, { step: 1, unit: "°" }),
          num("nameDx", "Posição do nome (→)", -140, 140, { step: 1 }),
          num("nameDy", "Posição do nome (↑)", -140, 140, { step: 1 }),
          num("depth", "Rebaixo / relevo", 0.4, 5),
          num("nameThickness", "Espessura do nome encaixado", 1.2, 6),
          num("clearance", "Folga do encaixe", 0, 0.6, { step: 0.05 }),
        ],
      },
      {
        title: "Tamanho e acabamento",
        fields: [
          num("height", "Altura da letra", 40, 280, { step: 1, hint: "Mesa de 256 mm: acima disso o app avisa." }),
          num("thickness", "Espessura", 3, 30),
          choice("finish", "Acabamento", [["flat", "Liso"], ["resin", "Borda para resina"], ["material", "Fundo para EVA/feltro"]]),
          num("wall", "Borda / moldura", 1.2, 6),
          num("resinHeight", "Altura da borda (resina)", 0.5, 6),
          num("materialThickness", "Espessura do material", 1, 6),
          choice("mount", "Fixação", [["none", "Nenhuma"], ["hang", "Furo para pendurar"], ["stand", "Suporte de mesa"]]),
          ...textureFields,
          color("letterColor", "Letra"),
          color("nameColor", "Nome"),
          color("accentColor", "Borda e suporte"),
        ],
      },
    ],
    build: (ctx, p) => buildBigLetter(ctx, as(p)),
  },
  {
    id: "puzzle",
    category: "home",
    label: "Quebra-cabeça",
    blurb: "Sua arte dividida em peças quadradas, com verso em outra cor, moldura e suporte opcionais.",
    icon: Puzzle,
    art: "Arte do quebra-cabeça (SVG ou imagem)",
    defaults: DEFAULT_PUZZLE,
    sections: [
      {
        title: "Peças",
        fields: [
          num("width", "Largura montado", 40, 250, { step: 1 }),
          num("columns", "Peças por linha", 2, 16, { step: 1, unit: "", hint: "As linhas seguem a proporção da arte." }),
          num("thickness", "Espessura", 2, 10),
          num("inlay", "Profundidade da arte", 0.2, 2, { hint: "A arte fica embutida, rente à face." }),
          num("clearance", "Folga entre peças", 0.1, 0.8, { step: 0.05 }),
          choice("face", "Imprimir com a arte", [["up", "Para cima"], ["down", "Para baixo (face lisa)"]]),
        ],
      },
      {
        title: "Moldura e cores",
        fields: [
          bool("frame", "Moldura"),
          bool("stand", "Suporte de mesa (com moldura)"),
          color("pieceColor", "Peças"),
          color("artColor", "Arte (1 cor)"),
          color("backColor", "Verso"),
          color("frameColor", "Moldura e suporte"),
        ],
      },
    ],
    build: (ctx, p) => buildPuzzle(ctx, as(p)),
  },
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
          num("height", "Altura", 60, 600, { step: 1, hint: "Acima de 256 mm a caixa sai em partes para colar." }),
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
];
