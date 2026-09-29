import { Box, CaseUpper, LayoutGrid, Layers, Lightbulb, Image, Link2, Puzzle, Type, Users } from "lucide-react";
import { buildAlphabetCube, DEFAULT_ALPHABET_CUBE } from "../../geometry/models/alphabetCube";
import { buildBigLetter, DEFAULT_BIG_LETTER } from "../../geometry/models/bigLetter";
import { buildDeskOrganizer, DEFAULT_DESK_ORGANIZER } from "../../geometry/models/deskOrganizer";
import { buildLayeredSign, DEFAULT_LAYERED_SIGN } from "../../geometry/models/layeredSign";
import { buildLedLetter, DEFAULT_LED_LETTER } from "../../geometry/models/ledLetter";
import { buildNamesPanel, DEFAULT_NAMES_PANEL } from "../../geometry/models/namesPanel";
import { buildPhotoHolder, DEFAULT_PHOTO_HOLDER } from "../../geometry/models/photoHolder";
import { buildWallLetters, DEFAULT_WALL_LETTERS } from "../../geometry/models/wallLetters";
import { buildNamePendants, DEFAULT_NAME_PENDANTS } from "../../geometry/models/namePendants";
import { buildPuzzle, DEFAULT_PUZZLE } from "../../geometry/models/puzzle";
import { as, bool, choice, color, font, num, text, textureFields, type ModelDef, type Section } from "./fields";

const signLine = (i: number): Section => ({
  title: `Linha ${i}`,
  fields: [text(`line${i}`, "Texto", 24), num(`h${i}`, "Altura", 6, 80, { step: 1 }), num(`dx${i}`, "Deslocamento (→)", -80, 80, { step: 1 }), color(`c${i}`, "Cor"), font(`font${i}`, `Fonte da linha ${i}`, `line${i}`)],
});

/** Modelos da fila do Torno (letra grande, quebra-cabeça, letreiros…). */
export const TORNO_MODELS: ModelDef[] = [
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
    id: "namesPanel",
    category: "plates",
    label: "Painel de nomes",
    blurb: "Placa com a lista de nomes (turma, família, equipe) em grade automática, título e furos.",
    icon: Users,
    font: true,
    defaults: DEFAULT_NAMES_PANEL,
    sections: [
      { title: "Nomes", fields: [text("title", "Título (opcional)", 40), text("names", "Nomes", 1500, "Separados por vírgula. A letra se ajusta para caber.")] },
      {
        title: "Tamanho e cores",
        fields: [
          num("width", "Largura", 60, 600, { step: 1, hint: "Acima de 256 mm sai em partes para colar." }),
          num("height", "Altura", 40, 600, { step: 1 }),
          num("titleHeight", "Altura do título", 6, 60, { step: 1 }),
          num("margin", "Margem", 3, 30, { step: 1 }),
          num("thickness", "Espessura", 1.6, 6),
          num("relief", "Relevo", 0.4, 3),
          bool("holes", "Furos para pendurar"),
          color("plateColor", "Placa"),
          color("textColor", "Nomes"),
        ],
      },
    ],
    build: (ctx, p) => buildNamesPanel(ctx, as(p)),
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
        fields: [text("text", "Texto", 20), num("height", "Altura na parede", 40, 1000, { step: 5, hint: "Letras maiores que 256 mm saem em partes." }), bool("template", "Gabarito de posicionamento")],
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
    id: "namePendants",
    category: "keychains",
    label: "Pingentes de nomes",
    blurb: "Um pingente por pessoa ou pet, com ícone e furos para ligar com argolas ou corrente.",
    icon: Link2,
    font: true,
    art: "Desenho para o ícone \"desenho\" (opcional)",
    defaults: DEFAULT_NAME_PENDANTS,
    sections: [
      { title: "Pingentes", fields: [text("items", "Nomes e ícones", 600, "Separados por vírgula: Nome; ícone (coração, pata, estrela, desenho ou nenhum).")] },
      {
        title: "Tamanho e cores",
        fields: [
          num("width", "Largura", 40, 100, { step: 1 }),
          num("base", "Espessura", 1.2, 5),
          num("relief", "Relevo", 0.4, 3),
          num("border", "Borda", 1, 8, { step: 0.5 }),
          bool("holes", "Furos de ligação nas laterais"),
          color("baseColor", "Base"),
          color("textColor", "Nome"),
          color("iconColor", "Ícone"),
        ],
      },
    ],
    build: (ctx, p) => buildNamePendants(ctx, as(p)),
  },
];
