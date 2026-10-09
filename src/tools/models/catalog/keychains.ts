import { BottleWine, Smartphone, CircleDashed, Disc3, Dumbbell, KeyRound, Link2, Nfc, PawPrint, Pencil, ToggleLeft } from "lucide-react";
import { buildArticulatedName, DEFAULT_ARTICULATED } from "../../../geometry/models/articulatedName";
import { buildClicker, DEFAULT_CLICKER } from "../../../geometry/models/clicker";
import { buildGymKeychain, DEFAULT_GYM_KEYCHAIN } from "../../../geometry/models/gymKeychain";
import { buildLogoPlate, DEFAULT_LOGO_KEYCHAIN } from "../../../geometry/models/logoPlate";
import { buildMirrorKeychain, DEFAULT_MIRROR } from "../../../geometry/models/mirrorKeychain";
import { buildNamePendants, DEFAULT_NAME_PENDANTS } from "../../../geometry/models/namePendants";
import { buildNfcKeychain, DEFAULT_NFC } from "../../../geometry/models/nfcKeychain";
import { buildOpener, DEFAULT_OPENER } from "../../../geometry/models/opener";
import { buildPencilTopper, DEFAULT_PENCIL_TOPPER } from "../../../geometry/models/pencilTopper";
import { buildPhoneKeychain, DEFAULT_PHONE_KEYCHAIN } from "../../../geometry/models/phoneKeychain";
import { buildPetTag, DEFAULT_PET_TAG } from "../../../geometry/models/petTag";
import { buildSpinner, DEFAULT_SPINNER } from "../../../geometry/models/spinner";
import { as, bool, choice, color, logoFields, num, resinFields, text, type ModelDef } from "../fields";

/** Modelos prontos da categoria Chaveiros. */
export const KEYCHAIN_MODELS: ModelDef[] = [
  {
    id: "spinner",
    category: "keychains",
    label: "Chaveiro giratório",
    blurb: "Disco que gira dentro da moldura, impresso já montado.",
    icon: Disc3,
    font: true,
    defaults: DEFAULT_SPINNER,
    sections: [
      { title: "Texto", fields: [text("text", "Texto no disco", 12)] },
      { title: "Tamanho e cores", fields: [num("diameter", "Diâmetro", 30, 70, { step: 1 }), num("thickness", "Espessura", 4, 8), num("gap", "Folga", 0.3, 0.8, { step: 0.05, hint: "0,5 costuma soltar bem; aumente se colar." }), num("relief", "Relevo", 0.4, 2), color("frameColor", "Moldura"), color("diskColor", "Disco"), color("textColor", "Texto")] },
    ],
    build: (ctx, p) => buildSpinner(ctx, as(p)),
  },
  {
    id: "nfc",
    category: "keychains",
    label: "Chaveiro NFC",
    blurb: "Bolsão para tag NFC com pausa no 3MF para colocar a tag.",
    icon: Nfc,
    font: true,
    defaults: DEFAULT_NFC,
    sections: [
      { title: "Texto", fields: [text("text", "Texto", 12)] },
      { title: "Tag e impressão", fields: [num("tagDiameter", "Diâmetro da tag", 15, 35, { hint: "NTAG213/215 redonda: 25 mm." }), num("tagThickness", "Espessura da tag", 0.3, 2), num("layerHeight", "Altura de camada", 0.08, 0.32, { step: 0.02, hint: "A mesma do fatiador: define a camada da pausa." })] },
      { title: "Tamanho e cores", fields: [{ k: "shape", kind: "choice", label: "Formato", options: [["circle", "Redondo"], ["square", "Quadrado"], ["heart", "Coração"], ["hexagon", "Hexágono"], ["star", "Estrela"], ["dodecagon", "12 lados"]] }, num("size", "Tamanho", 30, 70, { step: 1, hint: "Coração e estrela precisam de mais tamanho para a tag." }), num("relief", "Relevo", 0.4, 2), color("baseColor", "Base"), color("textColor", "Texto"), ...resinFields] },
    ],
    build: (ctx, p) => buildNfcKeychain(ctx, as(p)),
  },
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
    id: "gymKeychain",
    category: "keychains",
    label: "Chaveiro anilha",
    blurb: "Anilha de academia com aro, argola e sua arte ou texto na face.",
    icon: Dumbbell,
    font: true,
    art: "Arte da face (opcional; colorida vira várias cores)",
    defaults: DEFAULT_GYM_KEYCHAIN,
    sections: [
      { title: "Face", fields: [text("text", "Texto (sem desenho)", 8)] },
      { title: "Tamanho e cores", fields: [num("diameter", "Diâmetro", 25, 60, { step: 1 }), num("thickness", "Espessura", 3, 8), num("relief", "Relevo", 0.4, 3), color("plateColor", "Anilha"), color("artColor", "Arte (1 cor)")] },
    ],
    build: (ctx, p) => buildGymKeychain(ctx, as(p)),
  },
  {
    id: "articulatedName",
    category: "keychains",
    label: "Nome articulado",
    blurb: "Cada letra numa peça, ligadas por dobradiças que já saem montadas.",
    icon: Link2,
    font: true,
    defaults: DEFAULT_ARTICULATED,
    sections: [
      { title: "Nome", fields: [text("text", "Nome", 14), num("textHeight", "Altura das letras", 10, 30, { step: 1 })] },
      { title: "Dobradiça e cores", fields: [num("body", "Espessura", 5, 12), num("radial", "Folga radial", 0.15, 0.6, { step: 0.05, hint: "0,3 solta bem na maioria das impressoras." }), num("axial", "Folga axial", 0.2, 0.8, { step: 0.05 }), num("relief", "Relevo", 0.4, 2), color("baseColor", "Peças"), color("textColor", "Letras")] },
    ],
    build: (ctx, p) => buildArticulatedName(ctx, as(p)),
  },
  {
    id: "phoneKeychain",
    category: "keychains",
    label: "Chaveiro suporte de celular",
    blurb: "Chaveiro 3 em 1: abridor de lata, suporte de celular em pé (fenda inclinada na medida do aparelho) e sua arte na face.",
    icon: Smartphone,
    font: true,
    art: "Arte (opcional)",
    defaults: DEFAULT_PHONE_KEYCHAIN,
    sections: [
      { title: "Arte", fields: [text("text", "Texto (sem desenho)", 10)] },
      {
        title: "Celular e placa",
        fields: [
          num("deviceThickness", "Espessura do aparelho", 5, 16, { step: 0.5, hint: "Com a capinha: celular fica perto de 10 a 12 mm. A folga de 1 mm já vem somada." }),
          num("angle", "Inclinação do aparelho", 55, 75, { unit: "°", step: 1, hint: "Ângulo com a mesa; o aparelho se apoia inclinado para o lado da argola." }),
          num("thickness", "Espessura da placa", 9, 16, { step: 0.5, hint: "Precisa de fundo para a fenda: 12 mm serve para celular." }),
          num("relief", "Relevo da arte", 0.4, 2),
        ],
      },
      { title: "Cores", fields: [color("bodyColor", "Corpo"), color("artColor", "Arte (1 cor)")] },
    ],
    build: (ctx, p) => buildPhoneKeychain(ctx, as(p)),
  },
  {
    id: "opener",
    category: "keychains",
    label: "Chaveiro abridor",
    blurb: "Abridor de garrafa ou de lata com argola e sua arte.",
    icon: BottleWine,
    font: true,
    art: "Arte (opcional)",
    defaults: DEFAULT_OPENER,
    sections: [
      { title: "Tipo", fields: [choice("kind", "Abre", [["bottle", "Garrafa"], ["can", "Lata"]]), text("text", "Texto (sem desenho)", 10)] },
      { title: "Espessura e cores", fields: [num("thickness", "Espessura", 5, 10, { hint: "Faz força: 6 mm ou mais." }), num("relief", "Relevo", 0.4, 2), color("bodyColor", "Corpo"), color("artColor", "Arte (1 cor)")] },
      {
        title: "Fenda (lata) e NFC",
        fields: [
          num("slotX", "Fenda: posição (→)", -30, 10, { step: 0.5 }),
          num("slotY", "Fenda: posição (↑)", -12, 12, { step: 0.5 }),
          num("slotAngle", "Fenda: giro", -90, 90, { step: 5, unit: "°" }),
          bool("nfc", "Bolso para tag NFC (com pausa)"),
          num("tagDiameter", "Diâmetro da tag", 12, 27),
          num("tagThickness", "Espessura da tag", 0.3, 2),
          num("layerHeight", "Altura de camada", 0.08, 0.32, { step: 0.02, hint: "A mesma do fatiador: define a camada da pausa." }),
        ],
      },
    ],
    build: (ctx, p) => buildOpener(ctx, as(p)),
  },
  {
    id: "clicker",
    category: "keychains",
    label: "Clicker",
    blurb: "Chaveiro com chave mecânica (tipo Cherry MX) e tecla com sua arte.",
    icon: ToggleLeft,
    art: "Arte da tecla (opcional)",
    defaults: DEFAULT_CLICKER,
    sections: [
      { title: "Encaixes e cores", fields: [num("plateHole", "Recorte da chave", 13.8, 14.4, { step: 0.05, hint: "MX: 14,0 mm + folga." }), num("stemFit", "Folga da cruz", 0, 0.3, { step: 0.05 }), num("capSize", "Tecla", 16, 24), num("relief", "Arte", 0.4, 1.6), color("bodyColor", "Corpo"), color("capColor", "Tecla"), color("artColor", "Arte (1 cor)")] },
    ],
    build: (ctx, p) => buildClicker(ctx, as(p)),
  },
  {
    id: "petTag",
    category: "keychains",
    label: "Tag de pet",
    blurb: "Nome na frente; telefone e recado no verso, embutidos em outra cor.",
    icon: PawPrint,
    font: true,
    art: "Desenho do formato (formato \"Desenho\")",
    defaults: DEFAULT_PET_TAG,
    sections: [
      { title: "Textos", fields: [text("name", "Nome do pet", 14), text("phone", "Telefone (verso)", 20), text("note", "Recado (verso, opcional)", 30)] },
      {
        title: "Tamanho e cores",
        fields: [
          choice("shape", "Formato", [
            ["bone", "Osso"],
            ["paw", "Patinha"],
            ["circle", "Redonda"],
            ["heart", "Coração"],
            ["shield", "Escudo"],
            ["oval", "Oval"],
            ["wavy", "Oval ondulada"],
            ["fish", "Peixe"],
            ["art", "Desenho"],
          ]),
          num("size", "Tamanho", 25, 70, { step: 1 }),
          num("thickness", "Espessura", 1.8, 5),
          num("relief", "Relevo do nome", 0.4, 2),
          color("baseColor", "Tag"),
          color("textColor", "Nome"),
          color("backColor", "Verso"),
        ],
      },
    ],
    build: (ctx, p) => buildPetTag(ctx, as(p)),
  },
  {
    id: "mirror",
    category: "keychains",
    label: "Chaveiro espelho",
    blurb: "Segura um espelho redondo, com frases em arco no aro e desenho no verso.",
    icon: CircleDashed,
    font: true,
    art: "Desenho do verso (opcional)",
    defaults: DEFAULT_MIRROR,
    sections: [
      { title: "Frases", fields: [text("top", "Em cima", 30), text("bottom", "Embaixo", 30), num("textSize", "Altura do texto", 2.5, 6, { step: 0.1 })] },
      {
        title: "Espelho e cores",
        fields: [
          num("mirror", "Diâmetro do espelho", 20, 60, { step: 1, hint: "Comuns: 30, 40 e 50 mm." }),
          num("mirrorThickness", "Espessura do espelho", 1, 4),
          num("fit", "Folga do espelho", 0.1, 0.8, { step: 0.05 }),
          num("rim", "Aro", 4, 12, { step: 0.5 }),
          num("relief", "Relevo", 0.4, 1.5),
          color("bodyColor", "Chaveiro"),
          color("textColor", "Frases"),
          color("artColor", "Verso"),
        ],
      },
    ],
    build: (ctx, p) => buildMirrorKeychain(ctx, as(p)),
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
