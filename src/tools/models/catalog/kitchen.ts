import { CakeSlice, Candy, Scale, Cookie, CupSoda, Cylinder, Grid3x3, Lollipop, Paperclip, Stamp } from "lucide-react";
import { buildBagClip, DEFAULT_BAG_CLIP } from "../../../geometry/models/bagClip";
import { buildEjector, DEFAULT_EJECTOR } from "../../../geometry/models/brigadeiroEjector";
import { buildCandyMold, DEFAULT_CANDY_MOLD } from "../../../geometry/models/candyMold";
import { buildCakeStand, buildStickStand, DEFAULT_CAKE_STAND, DEFAULT_STICK_STAND } from "../../../geometry/models/confectionery";
import { buildCutterStamp, DEFAULT_CUTTER_STAMP } from "../../../geometry/models/cutterStamp";
import { buildCupHandle, DEFAULT_CUP_HANDLE } from "../../../geometry/models/cupHandle";
import { buildGridCutter, DEFAULT_GRID_CUTTER } from "../../../geometry/models/gridCutter";
import { buildStamp, DEFAULT_STAMP } from "../../../geometry/models/stamp";
import { buildTextureRoller, DEFAULT_TEXTURE_ROLLER } from "../../../geometry/models/textureRoller";
import { as, bool, choice, color, num, text, type ModelDef } from "../fields";
import { fitDefaults } from "../fitDefaults";

/** Modelos prontos da categoria Cozinha. */
export const KITCHEN_MODELS: ModelDef[] = [
  {
    id: "stamp",
    category: "kitchen",
    label: "Carimbo",
    blurb: "Para brigadeiro, biscoito e sabonete: arte espelhada e cabo de encaixe.",
    icon: Stamp,
    font: true,
    art: "Desenho do carimbo (opcional)",
    defaults: DEFAULT_STAMP,
    sections: [
      { title: "Marca", fields: [text("text", "Texto ou inicial (se não enviar desenho)", 12)] },
      { title: "Tamanho e cores", fields: [{ k: "shape", kind: "choice", label: "Formato", options: [["circle", "Redondo"], ["square", "Quadrado"]] }, num("size", "Tamanho", 20, 90, { step: 1 }), num("thickness", "Placa", 2, 8), num("relief", "Relevo da arte", 0.8, 4), { k: "handle", kind: "bool", label: "Cabo separado (encaixa atrás)" }, num("handleHeight", "Altura do cabo", 15, 60, { step: 1 }), color("plateColor", "Placa e cabo"), color("artColor", "Arte")] },
    ],
    build: (ctx, p) => buildStamp(ctx, as(p)),
  },
  {
    id: "ejector",
    category: "kitchen",
    label: "Ejetor de brigadeiro",
    blurb: "Forma no contorno do desenho e êmbolo que empurra o doce para fora.",
    icon: Candy,
    art: "Desenho da forma (SVG ou imagem)",
    defaults: DEFAULT_EJECTOR,
    sections: [
      {
        title: "Tamanho e cores",
        fields: [
          num("size", "Tamanho", 15, 60, { step: 1 }),
          num("height", "Altura da forma", 8, 40, { step: 1 }),
          num("wall", "Parede", 1.2, 3),
          num("clearance", "Folga do êmbolo", 0.2, 1, { step: 0.05, hint: "0,4 costuma deslizar bem." }),
          choice("bottom", "Fundo do doce", [["flat", "Plano"], ["round", "Borda arredondada"], ["dome", "Domo"]]),
          num("radius", "Raio da borda", 0.5, 8, { hint: "Vale para a borda arredondada." }),
          num("domeHeight", "Altura do domo", 1, 12, { hint: "Vale para o domo." }),
          num("smooth", "Suavização do domo", 0, 1, { step: 0.05, unit: "", hint: "0 = cone, 1 = doce mais redondo." }),
          color("frameColor", "Forma"),
          color("ejectorColor", "Êmbolo"),
        ],
      },
    ],
    build: (ctx, p) => buildEjector(ctx, as(p)),
  },
  {
    id: "candyMold",
    category: "kitchen",
    label: "Forma de docinho pelo peso",
    blurb: "Diga quantas gramas tem o docinho e a forma (coração, estrela, flor, barrinha, bolinha ou o seu desenho) já sai no tamanho certo, com êmbolo e a sua marca no doce.",
    icon: Scale,
    font: true,
    art: "Desenho da forma (opcional: vale no formato \"Meu desenho\")",
    art2: "Marca para o êmbolo (opcional: o doce sai com ela em relevo)",
    defaults: DEFAULT_CANDY_MOLD,
    liveDefaults: () => fitDefaults({ clearance: "candyClearance" }), // a folga do ejetor validada no Kit de testes (#247)
    sections: [
      {
        title: "Peso e formato",
        fields: [
          num("weight", "Peso do docinho", 5, 80, { step: 1, unit: "g", hint: "Brigadeiro de festa: 18 a 25 g. A cavidade é calculada pelo peso e pela densidade." }),
          num("density", "Densidade do doce", 0.8, 1.6, { step: 0.05, unit: "g/cm³", hint: "Brigadeiro: perto de 1,2. Para achar a do seu doce, imprima a forma de teste (10 cm³), encha, pese e divida por 10." }),
          choice("shape", "Formato", [["heart", "Coração"], ["star", "Estrela"], ["flower", "Flor"], ["bar", "Barrinha"], ["round", "Bolinha"], ["art", "Meu desenho"]]),
          num("depth", "Altura do docinho", 8, 30, { step: 1, hint: "Mais alto deixa a forma mais estreita; mais baixo, mais larga. O peso não muda." }),
        ],
      },
      {
        title: "Forma e êmbolo",
        fields: [
          num("wall", "Parede", 1.2, 3),
          num("clearance", "Folga do êmbolo", 0.2, 1, { step: 0.05, hint: "0,4 costuma deslizar bem." }),
          text("stampText", "Texto da marca no êmbolo (sem desenho)", 12),
          bool("showCandy", "Mostrar o docinho pronto na prévia (translúcido, só para ver a marca)"),
          choice("print", "Imprimir", [["candy", "Forma e êmbolo do docinho"], ["test", "Só a forma de teste (10 cm³)"]]),
          color("frameColor", "Forma"),
          color("ejectorColor", "Êmbolo"),
        ],
      },
    ],
    build: (ctx, p) => buildCandyMold(ctx, as(p)),
  },
  {
    id: "bagClip",
    category: "kitchen",
    label: "Clipe de saco",
    blurb: "Pinça em U que fecha saco de café ou salgadinho, com um desenho na ponta (coração se não enviar).",
    icon: Paperclip,
    art: "Desenho da ponta (opcional: sem ele sai um coração)",
    defaults: DEFAULT_BAG_CLIP,
    sections: [
      {
        title: "Saco",
        fields: [
          num("cover", "Largura da boca do saco", 40, 180, { step: 1, hint: "Comprimento das hastes." }),
          num("gap", "Espessura do saco dobrado", 0.4, 4, { step: 0.1, hint: "Saco de café dobrado: ~1,2 mm." }),
          num("arm", "Força (espessura das hastes)", 2, 5, { step: 0.1, hint: "Mais grossa = aperta mais e flexiona menos." }),
        ],
      },
      {
        title: "Tamanho e cores",
        fields: [num("height", "Largura do clipe", 6, 20, { step: 0.5 }), num("artWidth", "Tamanho do desenho", 15, 60, { step: 1 }), num("base", "Base do desenho", 1.6, 5), num("relief", "Relevo", 0.4, 3), color("clipColor", "Clipe"), color("artColor", "Desenho")],
      },
    ],
    build: (ctx, p) => buildBagClip(ctx, as(p)),
  },
  {
    id: "cutterStamp",
    category: "kitchen",
    label: "Cortador + carimbo",
    blurb: "Uma peça só: corta o biscoito e marca o desenho na mesma apertada.",
    icon: Cookie,
    art: "Desenho do biscoito (SVG ou imagem)",
    defaults: DEFAULT_CUTTER_STAMP,
    sections: [
      {
        title: "Tamanho",
        fields: [
          num("size", "Tamanho", 30, 120, { step: 1 }),
          num("height", "Altura da lâmina", 8, 25, { step: 0.5 }),
          num("stampDepth", "Profundidade da marca", 1, 8, { step: 0.5 }),
          num("blade", "Espessura da lâmina", 0.6, 2, { step: 0.1 }),
          num("plate", "Placa", 1.2, 4),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildCutterStamp(ctx, as(p)),
  },
  {
    id: "gridCutter",
    category: "kitchen",
    label: "Cortador em grade",
    blurb: "Corta massa e fondant em retângulos iguais de uma vez, com abas de pega e nome.",
    icon: Grid3x3,
    font: true,
    fontSection: 1,
    defaults: DEFAULT_GRID_CUTTER,
    sections: [
      {
        title: "Grade",
        fields: [
          num("cellWidth", "Largura da célula", 10, 120, { step: 1 }),
          num("cellHeight", "Altura da célula", 10, 120, { step: 1 }),
          num("cols", "Colunas", 1, 12, { step: 1, unit: "" }),
          num("rows", "Linhas", 1, 12, { step: 1, unit: "" }),
          num("cornerRadius", "Arredondar os cantos", 0, 15, { step: 0.5 }),
        ],
      },
      {
        title: "Lâmina e abas",
        fields: [
          num("height", "Altura", 8, 40, { step: 1 }),
          num("wall", "Espessura da lâmina", 0.6, 2, { step: 0.1, hint: "0,8 mm corta bem; menos que 0,6 some no fatiador." }),
          num("flangeHeight", "Altura da aba de apoio", 1, 5, { hint: "Fica virada para a mesa ao imprimir." }),
          num("flangeWidth", "Largura da aba de apoio", 1, 6),
          bool("tabs", "Abas de pega nas laterais"),
          num("tabLength", "Comprimento das abas", 12, 40, { step: 1 }),
          text("tabText", "Texto nas abas", 12),
          num("relief", "Relevo do texto", 0.4, 2),
          color("bodyColor", "Cortador"),
          color("textColor", "Texto"),
        ],
      },
    ],
    build: (ctx, p) => buildGridCutter(ctx, as({ ...p, rows: Number(p.rows), cols: Number(p.cols) })),
  },
  {
    id: "stickStand",
    category: "kitchen",
    label: "Suporte de palitos",
    blurb: "Base com furos para pirulito, cake pop e topo de bolo; leve, maciça ou com lugar para peso.",
    icon: Lollipop,
    defaults: DEFAULT_STICK_STAND,
    sections: [
      {
        title: "Furos",
        fields: [
          num("holes", "Quantos palitos", 1, 60, { step: 1, unit: "" }),
          num("stickDiameter", "Diâmetro do palito", 2, 12, { step: 0.5 }),
          num("clearance", "Folga do furo", 0, 1, { step: 0.05 }),
          num("spacing", "Distância entre os palitos", 10, 60, { step: 1 }),
          num("holeDepth", "Profundidade do furo", 5, 60, { step: 1 }),
        ],
      },
      {
        title: "Base",
        fields: [
          num("height", "Altura", 10, 70, { step: 1 }),
          choice("base", "Base", [["light", "Leve (oca por baixo)"], ["solid", "Maciça"], ["weight", "Com lugar para peso"]]),
          num("wall", "Parede", 1.2, 5),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildStickStand(ctx, as({ ...p, holes: Number(p.holes) })),
  },
  {
    id: "cakeStand",
    category: "kitchen",
    label: "Boleira",
    blurb: "Prato com pé, borda ondulada e nome; impressa numa peça, de cabeça para baixo, sem suporte.",
    icon: CakeSlice,
    font: true,
    defaults: DEFAULT_CAKE_STAND,
    sections: [
      { title: "Nome", fields: [text("name", "Nome na borda (opcional)", 30), num("nameSize", "Altura das letras", 6, 30, { step: 1 })] },
      {
        title: "Prato e pé",
        fields: [
          num("diameter", "Diâmetro do prato", 80, 250, { step: 1 }),
          num("thickness", "Espessura do prato", 2.5, 8),
          num("waves", "Ondas da borda", 0, 40, { step: 1, unit: "", hint: "0 = borda lisa." }),
          num("waveDepth", "Tamanho das ondas", 0, 10),
          num("height", "Altura", 30, 200, { step: 1 }),
          num("columnDiameter", "Diâmetro da coluna", 15, 80, { step: 1 }),
          num("footDiameter", "Diâmetro do pé", 30, 200, { step: 1, hint: "O pé abre a 45°: pé largo pede mais altura." }),
          num("wall", "Parede do pé", 1.6, 5),
          color("plateColor", "Boleira"),
          color("nameColor", "Nome"),
        ],
      },
    ],
    build: (ctx, p) => buildCakeStand(ctx, as(p)),
  },
  {
    id: "textureRoller",
    category: "kitchen",
    label: "Rolo de textura",
    blurb: "Marca massa, argila e biscoito com um desenho em mosaico ou envolvente, sem emenda.",
    icon: Cylinder,
    art: "Desenho do padrão (opcional)",
    defaults: DEFAULT_TEXTURE_ROLLER,
    sections: [
      {
        title: "Padrão",
        fields: [
          choice("pattern", "Padrão", [["tiles", "Mosaico"], ["wrap", "Desenho envolvente"]]),
          num("tileSize", "Tamanho do ladrilho", 6, 60, { step: 1, hint: "Ajustado para fechar a volta sem emenda." }),
          bool("brick", "Fileiras em tijolo (meio ladrilho)"),
          choice("relief", "Relevo", [["high", "Alto (desenho saltado)"], ["low", "Baixo (desenho rebaixado)"]]),
          num("depth", "Profundidade", 0.6, 4),
        ],
      },
      {
        title: "Rolo",
        fields: [
          num("diameter", "Diâmetro", 20, 90, { step: 1 }),
          num("width", "Largura", 20, 220, { step: 1 }),
          choice("ends", "Pontas", [["axle", "Furo para eixo"], ["handles", "Cabos impressos"]]),
          num("axleDiameter", "Diâmetro do eixo", 4, 20, { step: 0.1, hint: "Palito de churrasco ~4 mm, cabo de madeira 8 mm (+ folga)." }),
          num("handleDiameter", "Diâmetro dos cabos", 10, 30, { step: 1 }),
          num("handleLength", "Comprimento dos cabos", 15, 60, { step: 1 }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildTextureRoller(ctx, as(p)),
  },
  {
    id: "cupHandle",
    category: "kitchen",
    label: "Alça de copo térmico",
    blurb: "Alça removível para copo cônico (tipo Stanley): o copo assenta num fundo e uma luva do mesmo cone o abraça, com a alça em D com a alça arredondada e o nome na frente. Veja o encaixe pelo copo fantasma e imprima antes o anel de teste.",
    icon: CupSoda,
    font: true,
    defaults: DEFAULT_CUP_HANDLE,
    liveDefaults: () => fitDefaults({ clearance: "cupClearance" }), // a folga do copo validada no Kit de testes (#247)
    sections: [
      {
        title: "Medidas do copo",
        fields: [
          num("baseDiameter", "Diâmetro da base do copo", 40, 140, { step: 0.5, hint: "Meça com paquímetro ou fita: diâmetro = volta ÷ 3,14. Os perfis prontos são aproximados." }),
          num("topDiameter", "Diâmetro do corpo, lá em cima", 40, 160, { step: 0.5, hint: "Onde o copo é mais largo (abaixo da borda da tampa)." }),
          num("bodyHeight", "Altura do corpo", 80, 400, { step: 1, hint: "Da base até o topo do corpo cônico." }),
        ],
      },
      {
        title: "Luva e alça",
        fields: [
          num("gripZ", "Onde a luva começa (altura da base)", 10, 150, { step: 1, hint: "Mais baixo deixa o copo mais firme; a luva não pode passar do topo do corpo." }),
          num("sleeveHeight", "Altura da luva", 15, 60, { step: 1 }),
          num("clearance", "Folga do encaixe", 0.2, 1, { step: 0.05, hint: "0,5 serve na maioria. Imprima só o anel de teste: ele tem que subir pelo copo e parar na altura marcada. Se apertar, aumente a folga; se ficar frouxo, diminua." }),
          num("wall", "Parede da luva", 2, 6, { step: 0.5 }),
          num("handleWidth", "Largura da alça", 12, 30, { step: 1 }),
          num("fingerGap", "Vão dos dedos", 20, 60, { step: 1 }),
          bool("grooves", "Marcas de dedo na pegada"),
          choice("sleeveStyle", "Luva", [["smooth", "Lisa"], ["cutouts", "Vazada"], ["bands", "Com faixas"]]),
          bool("showCup", "Mostrar o copo fantasma na prévia (só para ver o encaixe)"),
        ],
      },
      {
        title: "Nome",
        fields: [
          text("name", "Nome", 12),
          choice("nameMode", "Nome", [["raised", "Em relevo (outra cor)"], ["engraved", "Gravado"], ["none", "Sem nome"]]),
          num("depth", "Profundidade / relevo", 0.4, 1.6, { step: 0.1 }),
        ],
      },
      {
        title: "Imprimir e cores",
        fields: [
          choice("print", "Imprimir", [["full", "Alça inteira"], ["test", "Só o anel de teste"]]),
          color("bodyColor", "Alça"),
          color("nameColor", "Nome (em relevo)"),
        ],
      },
    ],
    build: (ctx, p) => buildCupHandle(ctx, as(p)),
  },
];
