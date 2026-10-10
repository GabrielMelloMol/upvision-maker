import { Bookmark, Keyboard, Plane, CaseUpper, CircleDot, Frame, Gem, KeySquare, Lamp, LampDesk, PencilRuler, PenTool, Puzzle, Smartphone, WholeWord } from "lucide-react";
import { buildCutoutFrame, buildCutoutStand, DEFAULT_CUTOUT_FRAME, DEFAULT_CUTOUT_STAND } from "../../../geometry/models/cutoutFrame";
import { buildKitCard, DEFAULT_KIT_CARD } from "../../../geometry/models/kitCard";
import { buildKeycap, DEFAULT_KEYCAP } from "../../../geometry/models/keycap";
import { buildBigLetter, DEFAULT_BIG_LETTER } from "../../../geometry/models/bigLetter";
import { buildBigFrame, DEFAULT_BIG_FRAME } from "../../../geometry/models/bigFrame";
import { buildBookmark, DEFAULT_BOOKMARK } from "../../../geometry/models/bookmark";
import { buildCoaster, DEFAULT_COASTER } from "../../../geometry/models/coaster";
import { buildKeyHolder, DEFAULT_KEY_HOLDER } from "../../../geometry/models/keyHolder";
import { buildLamp, DEFAULT_LAMP } from "../../../geometry/models/lamp";
import { buildLineArtStand, DEFAULT_LINE_ART } from "../../../geometry/models/lineArtStand";
import { buildNfcJewelry, DEFAULT_NFC_JEWELRY } from "../../../geometry/models/nfcJewelry";
import { buildPenHolder, DEFAULT_PEN_HOLDER } from "../../../geometry/models/penHolder";
import { buildPhoneStand, DEFAULT_PHONE_STAND } from "../../../geometry/models/phoneStand";
import { buildPhoneStandFold, DEFAULT_PHONE_STAND_FOLD } from "../../../geometry/models/phoneStandFold";
import { buildPuzzle, DEFAULT_PUZZLE } from "../../../geometry/models/puzzle";
import { buildTableLamp, DEFAULT_TABLE_LAMP } from "../../../geometry/models/tableLamp";
import { buildWordDecor, DEFAULT_WORD_DECOR } from "../../../geometry/models/wordDecor";
import { as, bool, choice, color, font, nfcFields, num, profile, text, textureFields, type ModelDef } from "../fields";

/** Casa, 1ª parte da galeria: marca-página, porta-caneta, decoração, luminária, letra grande, quebra-cabeça, porta-copos, suporte de celular. */
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
    id: "cutoutFrame",
    category: "home",
    label: "Quadro vazado",
    blurb: "Desenho de linhas dentro de uma moldura (ex.: 18 × 25 cm), preso à moldura nos lados que você escolher para não soltar.",
    icon: Frame,
    art: "Desenho de linhas (SVG ou imagem; sem ele, um coração de exemplo)",
    defaults: DEFAULT_CUTOUT_FRAME,
    sections: [
      { title: "Moldura", fields: [num("width", "Largura", 60, 250, { step: 1, hint: "18 × 25 cm cabe na mesa de 256 mm." }), num("height", "Altura", 60, 250, { step: 1 }), num("border", "Largura da moldura", 4, 30, { step: 0.5 }), num("thickness", "Espessura", 1.6, 8)] },
      {
        title: "Desenho e pontes",
        fields: [
          num("gap", "Folga entre a moldura e o desenho", 0, 20, { step: 0.5 }),
          num("stroke", "Engrossar o traço", 0, 1.5, { step: 0.1, hint: "Liga traços quase encostados e deixa o desenho mais firme." }),
          bool("tieTop", "Preso em cima"),
          bool("tieBottom", "Preso embaixo"),
          bool("tieLeft", "Preso à esquerda"),
          bool("tieRight", "Preso à direita"),
          num("tieWidth", "Largura mínima da ponte", 2, 12, { step: 0.5, hint: "Cada ponte sai de onde o traço encosta na borda do desenho e vai reta até a moldura." }),
        ],
      },
      { title: "Cores", fields: [color("frameColor", "Moldura"), color("artColor", "Desenho")] },
    ],
    build: (ctx, p) => buildCutoutFrame(ctx, as(p)),
  },
  {
    id: "cutoutStand",
    category: "home",
    label: "Placa vazada em pé",
    blurb: "Desenho ou texto recortado numa placa, com lingueta e base de encaixe com texto. Avisa quando o miolo de uma letra cairia.",
    icon: Frame,
    font: true,
    art: "Desenho que sai vazado (opcional; sem ele, usa o texto)",
    defaults: DEFAULT_CUTOUT_STAND,
    sections: [
      { title: "Texto", fields: [text("text", "Texto vazado (sem desenho)", 16), text("baseText", "Texto na base", 26)] },
      { title: "Tamanho e cores", fields: [num("height", "Altura da placa", 50, 190, { step: 1, hint: "Até 190 mm: com a lingueta e a base ainda cabe na mesa de 256 mm." }), num("margin", "Margem em volta", 4, 25, { step: 0.5 }), num("thickness", "Espessura", 2.5, 8), color("plateColor", "Placa"), color("baseColor", "Base"), color("textColor", "Texto da base")] },
    ],
    build: (ctx, p) => buildCutoutStand(ctx, as(p)),
  },
  {
    id: "keycap",
    category: "home",
    label: "Tecla de teclado",
    blurb: "Tecla com haste em cruz MX (folga ajustável), topo plano ou esférico baixo e legenda embutida rente em outra cor. Lote para o teclado todo.",
    icon: Keyboard,
    font: true,
    art: "Ícone ou SVG da legenda (opcional; sem ele, usa o texto)",
    iconPicker: true,
    defaults: DEFAULT_KEYCAP,
    sections: [
      { title: "Legenda", fields: [text("legend", "Legenda (letra ou texto curto)", 6), num("legendHeight", "Altura da legenda", 3, 14, { step: 0.5 }), num("legendDepth", "Profundidade da legenda", 0.4, 1.2, { step: 0.1, hint: "A cor entra na tecla rente ao topo: 0,6 mm cobre bem." })] },
      {
        title: "Tecla e haste",
        fields: [
          num("units", "Largura (u)", 1, 2.25, { step: 0.25, unit: "u", hint: "1 u = 19,05 mm de passo. Teclas de 2 u ou mais usam estabilizador." }),
          num("height", "Altura", 6, 14, { step: 0.5 }),
          num("taper", "Afunilamento do topo", 0, 3, { step: 0.25, hint: "Quanto o topo é menor que a base, de cada lado." }),
          choice("profile", "Topo", [["flat", "Plano"], ["sphere", "Esférico baixo"]]),
          num("wall", "Parede", 0.8, 2.4, { step: 0.1 }),
          num("topThickness", "Espessura do topo", 1, 3, { step: 0.1 }),
          num("fit", "Folga da cruz da haste", 0, 0.5, { step: 0.05, hint: "Somada às medidas da cruz do interruptor MX: 0,15 costuma entrar justo; aumente se ficar duro." }),
        ],
      },
      { title: "Impressão e cores", fields: [choice("layout", "Disposição", [["print", "Pronta para imprimir (de ponta-cabeça)"], ["assembled", "Montada (topo para cima)"]]), color("bodyColor", "Tecla"), color("legendColor", "Legenda")] },
    ],
    build: (ctx, p) => buildKeycap(ctx, as(p)),
  },
  {
    id: "kitCard",
    category: "home",
    label: "Kit card (montar)",
    blurb: "Uma imagem vira um kit de montar: peças planas num cartão fino com o nome gravado, presas por pontos de corte. Figura/animal (costelas) ou veículo (rodas).",
    icon: Plane,
    font: true,
    art: "Imagem da vista de lado (foto ou desenho; o fundo da foto é recortado)",
    art2: "Vista de cima (opcional, só na figura: dá a largura das costelas)",
    cutout: true,
    defaults: DEFAULT_KIT_CARD,
    sections: [
      { title: "Tipo de montagem", fields: [choice("mode", "Monta como", [["figure", "Figura ou animal"], ["vehicle", "Veículo"]])] },
      {
        title: "Cartão",
        fields: [
          text("title", "Nome do kit (gravado na moldura)", 24),
          choice("cardSize", "Tamanho do cartão", [["credit", "Cartão de crédito (85,6 × 54)"], ["medium", "Médio (120 × 85)"], ["large", "Grande (180 × 120)"], ["xlarge", "Maior (240 × 160)"]]),
          num("copies", "Cartões na mesa", 1, 12, { step: 1, unit: "", hint: "Os cartões pequenos cabem vários numa mesa só." }),
          num("frame", "Largura da moldura", 2, 5, { step: 0.5 }),
          num("runner", "Largura dos galhos", 3, 5, { step: 0.5, hint: "Os galhos ligam a moldura às peças, e cada peça leva seu número." }),
          num("gap", "Comprimento do ponto de corte", 2, 4, { step: 0.5 }),
          num("engrave", "Profundidade do nome e dos números", 0.3, 1, { step: 0.1 }),
        ],
      },
      {
        title: "Figura ou animal (costelas)",
        when: { k: "mode", is: "figure" },
        fields: [
          num("ribs", "Número de costelas", 2, 10, { step: 1, unit: "", hint: "Seções transversais ao longo do comprimento; as das pontas, baixas demais, são descartadas." }),
          num("maxWidth", "Largura máxima", 20, 65, { step: 1, unit: "%", hint: "Em % do comprimento da silhueta. Com a vista de cima, a largura de cada costela vem dela." }),
          num("spines", "Placas laterais", 1, 2, { step: 1, unit: "", hint: "2 = como no elefante (duas silhuetas e as costelas entre elas)." }),
          choice("profile", "Seção das costelas", [["oval", "Oval"], ["boxy", "Quase retangular"]]),
        ],
      },
      {
        title: "Veículo (rodas e eixos)",
        when: { k: "mode", is: "vehicle" },
        fields: [
          num("wheel", "Diâmetro das rodas", 12, 36, { step: 1, unit: "%", hint: "Em % do comprimento do veículo." }),
          num("track", "Distância entre as laterais", 22, 50, { step: 1, unit: "%", hint: "Em % do comprimento: define a largura do chassi." }),
          num("tire", "Espessura do pneu", 0, 3, { step: 0.5, hint: "0 = sem pneu. O pneu sai em outra cor, num anel em volta da roda." }),
          num("axleFit", "Folga do eixo no furo", 0.05, 0.4, { step: 0.05, hint: "O eixo entra por pressão no furo da lateral: 0,15 prende; aumente se ficar duro, diminua se soltar." }),
          color("wheelColor", "Rodas"),
          color("tireColor", "Pneus"),
        ],
      },
      {
        title: "Peças e encaixe",
        fields: [
          num("thickness", "Espessura do cartão e das peças", 1.2, 2, { step: 0.1, hint: "1,6 mm costuma ser firme e imprime rápido." }),
          num("fit", "Folga da fenda", 0.1, 0.4, { step: 0.05, hint: "Somada à espessura: a fenda mede espessura + folga. 0,2 encaixa justo; aumente se ficar duro." }),
          num("close", "Fechar frestas da imagem", 0, 3, { step: 0.5, hint: "Junta pedaços e fecha contornos abertos de até 2× este valor, para cada peça sair inteira." }),
          bool("showAssembled", "Mostrar o modelo montado ao lado (só na prévia)"),
        ],
      },
      { title: "Cores", fields: [color("frameColor", "Cartão e pontos de corte"), color("pieceColor", "Peças"), color("titleColor", "Nome e números")] },
    ],
    build: (ctx, p) => buildKitCard(ctx, as(p)),
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
          num("size", "Tamanho", 60, 150, { step: 1, hint: "Diâmetro, lado ou largura entre lados; na forma Desenho, o maior lado." }),
          num("thickness", "Espessura", 3, 8, { step: 0.5 }),
          num("corner", "Cantos arredondados", 0, 20, { step: 1, hint: "Só no quadrado e no hexágono." }),
        ],
      },
      {
        title: "Nome ou arte",
        fields: [
          choice("content", "Na face", [["text", "Nome"], ["art", "Arte enviada"]]),
          text("text", "Nome", 24),
          num("textHeight", "Altura do nome", 6, 40, { step: 1 }),
          num("depth", "Profundidade do desenho", 0.4, 2, { step: 0.1 }),
          num("borderWidth", "Anel na borda", 0, 6, { step: 0.5, hint: "Anel na cor do desenho, rente à face; 0 = sem." }),
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
  {
    id: "bigFrame",
    category: "home",
    label: "Moldura grande dividida",
    blurb: "Moldura de pôster ou quadro maior que a mesa, cortada em peças que se encaixam sem cola, com garras para a arte, gancho ou apoio de mesa e cantos em outra cor.",
    icon: Frame,
    defaults: DEFAULT_BIG_FRAME,
    sections: [
      {
        title: "Arte e moldura",
        fields: [
          num("artW", "Largura da arte", 100, 1000, { step: 5, hint: "O papel ou a tela. Um pôster de 50 × 70 cm é 500 × 700." }),
          num("artH", "Altura da arte", 100, 1000, { step: 5 }),
          num("width", "Largura da moldura", 20, 40, { step: 1, hint: "Da janela até a borda de fora. Menos de 20 não deixa espaço para o encaixe e as garras." }),
          num("depth", "Espessura", 8, 25, { step: 1, hint: "A frente tem 3 mm e o resto é o rebaixo onde a arte entra, por trás." }),
          { k: "profile", kind: "choice", label: "Perfil", options: [["flat", "Reto"], ["chamfer", "Chanfrado"], ["round", "Arredondado"]] },
        ],
      },
      {
        title: "Fixação",
        fields: [
          { k: "claws", kind: "bool", label: "Garras (seguram a arte por trás)" },
          { k: "back", kind: "choice", label: "Atrás", options: [["none", "Nada"], ["hook", "Gancho (2 chaveiros)"], ["easel", "Apoio de mesa (perna)"]] },
        ],
      },
      { title: "Cores", fields: [color("bodyColor", "Moldura"), color("cornerColor", "Cantos")] },
    ],
    build: (ctx, p) => buildBigFrame(ctx, as(p)),
  },
  {
    id: "phoneStand",
    category: "home",
    label: "Suporte de celular e tablet",
    blurb: "Apoio inclinado de 45 a 75° na medida do aparelho com a capinha, lábio frontal, passagem de cabo e nome ou logo em relevo na frente.",
    icon: Smartphone,
    font: true,
    fontSection: 1,
    art: "Logo em relevo na frente (opcional)",
    defaults: DEFAULT_PHONE_STAND,
    sections: [
      {
        title: "Aparelho e medidas",
        fields: [
          num("angle", "Inclinação", 45, 75, { unit: "°", step: 1, hint: "Ângulo do apoio com a mesa. 60° serve para ver a tela e digitar; a partir de 45° não precisa de suporte na impressão." }),
          num("deviceThickness", "Espessura do aparelho", 5, 25, { step: 0.5, hint: "Com a capinha. Celular fica perto de 10 a 12 mm, tablet de 8 a 18 mm. A folga de 1 mm já vem somada." }),
          num("width", "Largura", 50, 160, { step: 1 }),
          num("height", "Altura do apoio", 40, 150, { step: 1, hint: "Na vertical: uns 90 para celular e 130 para tablet." }),
          num("lip", "Lábio da frente", 5, 25, { step: 1, hint: "Segura a beirada de baixo do aparelho. O app aumenta se for baixo para a espessura e o ângulo." }),
          num("cable", "Passagem do cabo", 0, 30, { step: 1, hint: "Furo sob o aparelho e canal embaixo até atrás, para o cabo de carregar. 0 = sem." }),
        ],
      },
      {
        title: "Nome ou logo em relevo",
        fields: [text("text", "Nome (na frente)", 24), num("textHeight", "Altura do nome", 4, 16, { step: 1 }), num("relief", "Relevo", 0.4, 1.5, { step: 0.1 })],
      },
      { title: "Cores", fields: [color("bodyColor", "Suporte"), color("textColor", "Nome ou logo")] },
    ],
    build: (ctx, p) => buildPhoneStand(ctx, as(p)),
  },
  {
    id: "phoneStandFold",
    category: "home",
    label: "Suporte de celular dobrável",
    blurb: "Suporte pequeno que dobra: dobradiças impressas já montadas (sem montar nada), 3 travas de ângulo e nome em relevo na base.",
    icon: Smartphone,
    font: true,
    fontSection: 1,
    art: "Logo em relevo na base (opcional)",
    defaults: DEFAULT_PHONE_STAND_FOLD,
    sections: [
      {
        title: "Tamanho e ângulo",
        fields: [
          num("angle", "Ângulo do meio", 45, 65, { unit: "°", step: 1, hint: "O suporte tem 3 travas: este ângulo e 10° a menos e a mais. Em pé o celular fica a uns 55°, deitado para digitar a uns 45°." }),
          num("width", "Largura", 60, 110, { step: 1, hint: "Celular: 70 mm. Tablet: 100 mm ou mais." }),
          num("height", "Apoio", 40, 85, { step: 1, hint: "O comprimento da parte onde o aparelho se apoia. A escora tem quase o mesmo comprimento." }),
          num("frontLength", "Base da frente", 30, 60, { step: 1, hint: "A parte que fica à frente, com o nome. Mais comprida deixa o suporte mais firme." }),
        ],
      },
      {
        title: "Dobradiça e nome",
        fields: [
          num("clearance", "Folga das dobradiças", 0.3, 0.5, { step: 0.05, hint: "Impressora bem calibrada: 0,3. Se as peças grudarem ao imprimir ou a dobradiça ficar dura, use 0,5. Maior que isso deixa frouxo." }),
          text("text", "Nome (na base)", 24),
          num("textHeight", "Altura do nome", 4, 14, { step: 1 }),
          num("relief", "Relevo", 0.4, 1.5, { step: 0.1 }),
        ],
      },
      {
        title: "Como sai no arquivo",
        fields: [choice("layout", "Disposição", [["print", "Para imprimir"], ["assembled", "Montado"], ["folded", "Dobrado"]]), color("bodyColor", "Suporte"), color("textColor", "Nome ou logo")],
      },
    ],
    build: (ctx, p) => buildPhoneStandFold(ctx, as(p)),
  },
];
