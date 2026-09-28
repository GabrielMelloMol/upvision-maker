import { Candy, Cookie, Frame, KeyRound, Paperclip, Pencil, Signpost, WholeWord } from "lucide-react";
import { buildBagClip, DEFAULT_BAG_CLIP } from "../../geometry/models/bagClip";
import { buildEjector, DEFAULT_EJECTOR } from "../../geometry/models/brigadeiroEjector";
import { buildCutterStamp, DEFAULT_CUTTER_STAMP } from "../../geometry/models/cutterStamp";
import { buildLogoPlate, DEFAULT_ADAPTIVE_PLATE, DEFAULT_LOGO_KEYCHAIN } from "../../geometry/models/logoPlate";
import { buildPencilTopper, DEFAULT_PENCIL_TOPPER } from "../../geometry/models/pencilTopper";
import { buildSignPlate, DEFAULT_SIGN_PLATE } from "../../geometry/models/signPlate";
import { buildWordDecor, DEFAULT_WORD_DECOR } from "../../geometry/models/wordDecor";
import { as, bool, color, num, text, type ModelDef } from "./fields";

const logoFields = (maxW: number) => [
  num("width", "Largura da arte", 15, maxW, { step: 1 }),
  num("base", "Base", 1.2, 8),
  num("relief", "Relevo", 0.4, 4),
  num("border", "Borda", 1, 10, { step: 0.5 }),
];

/** Modelos de texto/placa e culinária (#9). */
export const TEXT_KITCHEN_MODELS: ModelDef[] = [
  {
    id: "logoKeychain",
    category: "keychains",
    label: "Chaveiro de logo",
    blurb: "Base no contorno do logo, argola e a arte em relevo (colorida sai uma parte por cor).",
    icon: KeyRound,
    art: "Logo (SVG ou imagem; colorido vira várias cores)",
    defaults: DEFAULT_LOGO_KEYCHAIN,
    sections: [{ title: "Tamanho e cores", fields: [...logoFields(80), bool("ring", "Argola"), color("baseColor", "Base"), color("artColor", "Arte (1 cor)")] }],
    build: (ctx, p) => buildLogoPlate(ctx, as(p)),
  },
  {
    id: "adaptivePlate",
    category: "plates",
    label: "Placa adaptável",
    blurb: "Placa que segue o contorno do desenho, para parede ou mesa.",
    icon: Frame,
    art: "Desenho da placa (SVG ou imagem)",
    defaults: DEFAULT_ADAPTIVE_PLATE,
    sections: [{ title: "Tamanho e cores", fields: [...logoFields(250), color("baseColor", "Base"), color("artColor", "Arte (1 cor)")] }],
    build: (ctx, p) => buildLogoPlate(ctx, as({ ...p, ring: false })),
  },
  {
    id: "pencilTopper",
    category: "keychains",
    label: "Topo de lápis",
    blurb: "Nome em relevo que encaixa na ponta do lápis.",
    icon: Pencil,
    font: true,
    defaults: DEFAULT_PENCIL_TOPPER,
    sections: [
      { title: "Nome", fields: [text("text", "Nome", 12), num("textHeight", "Altura do nome", 8, 25, { step: 1 }), num("maxWidth", "Largura máxima", 25, 70, { step: 1 })] },
      {
        title: "Encaixe e cores",
        fields: [
          num("holeD", "Furo do lápis", 5, 12, { step: 0.1, hint: "Folga: lápis comum ~7,5 mm → furo 7,8." }),
          num("body", "Espessura do corpo", 8, 18),
          num("relief", "Relevo", 0.4, 3),
          color("bodyColor", "Corpo"),
          color("textColor", "Nome"),
        ],
      },
    ],
    build: (ctx, p) => buildPencilTopper(ctx, as(p)),
  },
  {
    id: "sign",
    category: "plates",
    label: "Placa de sinalização",
    blurb: "Placa retangular com ícone vazado num painel e texto em relevo.",
    icon: Signpost,
    font: true,
    art: "Ícone (opcional, sai vazado)",
    defaults: DEFAULT_SIGN_PLATE,
    sections: [
      { title: "Texto", fields: [text("text", "Texto", 30)] },
      {
        title: "Tamanho e cores",
        fields: [
          num("width", "Largura", 60, 300, { step: 1 }),
          num("height", "Altura", 20, 120, { step: 1 }),
          num("thickness", "Espessura", 1.6, 6),
          num("panel", "Painel do ícone", 0.8, 4),
          num("relief", "Relevo do texto", 0.4, 3),
          color("plateColor", "Placa"),
          color("accentColor", "Texto e painel"),
        ],
      },
    ],
    build: (ctx, p) => buildSignPlate(ctx, as(p)),
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
          color("frameColor", "Forma"),
          color("ejectorColor", "Êmbolo"),
        ],
      },
    ],
    build: (ctx, p) => buildEjector(ctx, as(p)),
  },
  {
    id: "bagClip",
    category: "kitchen",
    label: "Clipe de saco",
    blurb: "Forquilha que fecha saco de café ou salgadinho, com o desenho na ponta.",
    icon: Paperclip,
    art: "Desenho da ponta (SVG ou imagem)",
    defaults: DEFAULT_BAG_CLIP,
    sections: [
      {
        title: "Tamanho e cores",
        fields: [
          num("artWidth", "Largura do desenho", 25, 60, { step: 1 }),
          num("gap", "Folga da fenda", 0.6, 3, { step: 0.1, hint: "Saco fino dobrado: 1,2 mm." }),
          num("base", "Base do desenho", 1.6, 5),
          num("relief", "Relevo", 0.4, 3),
          color("clipColor", "Clipe"),
          color("artColor", "Arte (1 cor)"),
        ],
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
];
