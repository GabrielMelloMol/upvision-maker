import { CaseUpper, LayoutGrid, Layers, Lightbulb, Puzzle } from "lucide-react";
import { buildBigLetter, DEFAULT_BIG_LETTER } from "../../geometry/models/bigLetter";
import { buildDeskOrganizer, DEFAULT_DESK_ORGANIZER } from "../../geometry/models/deskOrganizer";
import { buildLayeredSign, DEFAULT_LAYERED_SIGN } from "../../geometry/models/layeredSign";
import { buildLedLetter, DEFAULT_LED_LETTER } from "../../geometry/models/ledLetter";
import { buildPuzzle, DEFAULT_PUZZLE } from "../../geometry/models/puzzle";
import { BG_TEXTURES } from "../../geometry/models/textures";
import { as, bool, choice, color, font, num, text, type FieldDef, type ModelDef, type Section } from "./fields";

const textureFields: FieldDef[] = [
  choice("texture", "Textura do fundo", BG_TEXTURES),
  num("texturePitch", "Tamanho do padrão", 3, 20, { step: 0.5 }),
  num("textureDepth", "Rebaixo da textura", 0.4, 1, { step: 0.1 }),
];

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
];
