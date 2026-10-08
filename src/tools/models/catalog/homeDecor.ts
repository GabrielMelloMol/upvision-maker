import { Bookmark, CaseUpper, CircleDot, Gem, KeySquare, Lamp, LampDesk, PencilRuler, PenTool, Puzzle, WholeWord } from "lucide-react";
import { buildBigLetter, DEFAULT_BIG_LETTER } from "../../../geometry/models/bigLetter";
import { buildBookmark, DEFAULT_BOOKMARK } from "../../../geometry/models/bookmark";
import { buildCoaster, DEFAULT_COASTER } from "../../../geometry/models/coaster";
import { buildKeyHolder, DEFAULT_KEY_HOLDER } from "../../../geometry/models/keyHolder";
import { buildLamp, DEFAULT_LAMP } from "../../../geometry/models/lamp";
import { buildLineArtStand, DEFAULT_LINE_ART } from "../../../geometry/models/lineArtStand";
import { buildNfcJewelry, DEFAULT_NFC_JEWELRY } from "../../../geometry/models/nfcJewelry";
import { buildPenHolder, DEFAULT_PEN_HOLDER } from "../../../geometry/models/penHolder";
import { buildPuzzle, DEFAULT_PUZZLE } from "../../../geometry/models/puzzle";
import { buildTableLamp, DEFAULT_TABLE_LAMP } from "../../../geometry/models/tableLamp";
import { buildWordDecor, DEFAULT_WORD_DECOR } from "../../../geometry/models/wordDecor";
import { as, bool, choice, color, font, nfcFields, num, profile, text, textureFields, type ModelDef } from "../fields";

/** Casa, 1ª parte da galeria: marca-página, porta-caneta, decoração, luminária, letra grande, quebra-cabeça, porta-copos. */
export const HOME_DECOR_MODELS: ModelDef[] = [
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
    id: "tableLamp",
    category: "home",
    label: "Abajur de mesa",
    blurb: "Cúpula por perfil (esfera, cilindro, cone, pera ou livre) com ondas, facetas ou furos, e base com encaixe para soquete E27 ou E14. Só para lâmpada LED.",
    icon: LampDesk,
    defaults: DEFAULT_TABLE_LAMP,
    sections: [
      {
        title: "Cúpula",
        fields: [
          choice("shape", "Forma", [["pear", "Pera"], ["sphere", "Esfera"], ["cylinder", "Cilindro"], ["cone", "Cone"], ["free", "Livre (perfil)"]]),
          profile("profile", "Perfil livre (raios de baixo para cima)", 15, 120),
          num("diameter", "Diâmetro (formas prontas)", 70, 230, { step: 1 }),
          num("height", "Altura da cúpula", 80, 170, { step: 1, hint: "A cúpula mais a base (até 80 mm) cabem nos 256 mm de altura da A1, P1 e X1." }),
          num("wall", "Parede", 0.8, 3, { step: 0.1, hint: "Parede fina deixa passar mais luz; com filamento claro 1,2 mm difunde bem." }),
          choice("texture", "Textura", [["none", "Lisa"], ["waves", "Ondas"], ["facets", "Facetas"], ["holes", "Furos"]]),
          num("textureCount", "Quantidade (ondas, lados ou furos por fileira)", 3, 40, { step: 1, unit: "" }),
          num("textureSize", "Tamanho (altura da onda ou diâmetro do furo)", 2, 12, { step: 0.5 }),
        ],
      },
      {
        title: "Base e soquete",
        fields: [
          choice("socket", "Soquete", [["E27", "E27 (rosca grossa)"], ["E14", "E14 (rosca fina)"]]),
          num("socketClearance", "Folga do soquete", -0.5, 1.5, { step: 0.1, hint: "Os soquetes variam entre fabricantes: meça o seu e ajuste. A peça segura o soquete por encaixe." }),
          num("socketDepth", "Profundidade do bolso", 20, 50, { step: 1 }),
          num("baseDiameter", "Diâmetro da base", 70, 200, { step: 1 }),
          num("baseHeight", "Altura da base", 30, 80, { step: 1 }),
        ],
      },
      {
        title: "Montagem e cores",
        fields: [choice("layout", "Disposição", [["assembled", "Montada (prévia)"], ["print", "Pronta para imprimir"]]), color("shadeColor", "Cúpula (claro deixa a luz passar)"), color("baseColor", "Base")],
      },
    ],
    build: (ctx, p) => buildTableLamp(ctx, as(p)),
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
          num("height", "Altura da letra", 40, 280, { step: 1, hint: "Maior que a mesa da impressora: o app avisa." }),
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
    blurb: "Sua arte em peças com encaixe de verdade (clássico, bolinha, onda…), contorno, número no verso e peça de teste.",
    icon: Puzzle,
    art: "Arte do quebra-cabeça (SVG ou imagem, opcional)",
    defaults: DEFAULT_PUZZLE,
    sections: [
      {
        title: "Peças",
        fields: [
          choice("output", "Imprimir", [["full", "Quebra-cabeça"], ["test", "Peça de teste (2 × 2)"]]),
          num("width", "Largura montado", 40, 250, { step: 1 }),
          num("columns", "Peças por linha", 2, 16, { step: 1, unit: "" }),
          num("rows", "Linhas", 0, 16, { step: 1, unit: "", hint: "0 = segue a proporção da arte." }),
          choice("outline", "Contorno", [["rect", "Retângulo"], ["circle", "Círculo"], ["heart", "Coração"], ["art", "Do desenho"]]),
        ],
      },
      {
        title: "Encaixe",
        fields: [
          choice("knob", "Tipo de encaixe", [["classic", "Clássico"], ["round", "Bolinha"], ["square", "Quadrado"], ["wave", "Ondulado"], ["triangle", "Triangular"], ["straight", "Sem encaixe (reto)"]]),
          num("knobSize", "Tamanho da orelha", 15, 30, { step: 1, unit: "%", hint: "Em relação ao lado da peça." }),
          bool("random", "Cada peça diferente"),
          num("seed", "Sorteio nº", 1, 999, { step: 1, hint: "Troque o número para outro corte; o mesmo número refaz igual." }),
          num("clearance", "Folga entre peças", 0.1, 0.8, { step: 0.05, hint: "0,2 a 0,3 mm na maioria das impressoras. Acerte com a peça de teste." }),
        ],
      },
      {
        title: "Espessura e verso",
        fields: [
          num("thickness", "Espessura", 2, 10),
          num("inlay", "Profundidade da arte", 0.2, 2, { hint: "A arte fica embutida, rente à face." }),
          choice("face", "Imprimir com a arte", [["up", "Para cima"], ["down", "Para baixo (face lisa)"]]),
          bool("numbers", "Número no verso (para montar)"),
          choice("layout", "Prévia", [["spread", "Espalhado (para imprimir)"], ["assembled", "Montado (só para ver)"]]),
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
    id: "coaster",
    category: "home",
    label: "Porta-copos",
    blurb: "Redondo, quadrado, hexágono ou no contorno de um desenho, com nome ou arte rente em 2 cores, anel na borda, pés de silicone e suporte para 2 a 6.",
    icon: CircleDot,
    font: true,
    fontSection: 1,
    art: "Desenho (SVG ou imagem): na face, ou o contorno se a forma for \"Desenho\"",
    defaults: DEFAULT_COASTER,
    sections: [
      {
        title: "Forma",
        fields: [
          choice("shape", "Forma", [["round", "Redondo"], ["square", "Quadrado"], ["hex", "Hexágono"], ["svg", "Desenho"]]),
          num("size", "Tamanho (mm)", 60, 150, { step: 1, hint: "Diâmetro, lado ou largura entre lados; na forma Desenho, o maior lado." }),
          num("thickness", "Espessura (mm)", 3, 8, { step: 0.5 }),
          num("corner", "Cantos arredondados (mm)", 0, 20, { step: 1, hint: "Só no quadrado e no hexágono." }),
        ],
      },
      {
        title: "Nome ou arte",
        fields: [
          choice("content", "Na face", [["text", "Nome"], ["art", "Arte enviada"]]),
          text("text", "Nome", 24),
          num("textHeight", "Altura do nome (mm)", 6, 40, { step: 1 }),
          num("depth", "Profundidade do desenho (mm)", 0.4, 2, { step: 0.1 }),
          num("borderWidth", "Anel na borda (mm)", 0, 6, { step: 0.5, hint: "Anel na cor do desenho, rente à face; 0 = sem." }),
        ],
      },
      {
        title: "Pés, suporte e cores",
        fields: [
          bool("faceDown", "Imprimir com o desenho para baixo (face lisa)"),
          bool("feet", "Rebaixo para pés de silicone (4 de 8 mm)"),
          num("stand", "Suporte para quantos (0 = sem)", 0, 6, { step: 1, hint: "Suporte com fendas onde os porta-copos ficam em pé, lado a lado." }),
          color("bodyColor", "Porta-copos"),
          color("artColor", "Desenho"),
        ],
      },
    ],
    build: (ctx, p) => buildCoaster(ctx, as(p)),
  },
];
