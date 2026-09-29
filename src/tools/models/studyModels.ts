import { BriefcaseBusiness, CircleDashed, IdCard, LayoutGrid, PawPrint, PenTool, QrCode, Snowflake } from "lucide-react";
import { buildBusinessCard, DEFAULT_BUSINESS_CARD } from "../../geometry/models/businessCard";
import { buildLineArtStand, DEFAULT_LINE_ART } from "../../geometry/models/lineArtStand";
import { buildMirrorKeychain, DEFAULT_MIRROR } from "../../geometry/models/mirrorKeychain";
import { buildPetTag, DEFAULT_PET_TAG } from "../../geometry/models/petTag";
import { buildProfessionPlaque, DEFAULT_PROFESSION } from "../../geometry/models/professionPlaque";
import { buildQrList, buildQrPlate, DEFAULT_QR_LIST, DEFAULT_QR_PLATE } from "../../geometry/models/qrPlate";
import { buildSnowflake, DEFAULT_SNOWFLAKE } from "../../geometry/models/snowflake";
import { as, bool, choice, color, num, text, type ModelDef } from "./fields";

/** Modelos do estudo de customizadores (#23): tipos genéricos de produto, desenhados do zero. */
export const STUDY_MODELS: ModelDef[] = [
  {
    id: "qrPlate",
    category: "plates",
    label: "Placa QR",
    blurb: "Wi-Fi, WhatsApp, Instagram, avaliação no Google ou link, com ícone, título e suporte.",
    icon: QrCode,
    font: true,
    fontSection: 1,
    defaults: DEFAULT_QR_PLATE,
    sections: [
      {
        title: "QR",
        fields: [
          choice("kind", "Tipo", [
            ["wifi", "Wi-Fi"],
            ["whatsapp", "WhatsApp"],
            ["instagram", "Instagram"],
            ["review", "Avaliação"],
            ["link", "Link"],
          ]),
          text("value", "Rede Wi-Fi, telefone, @perfil ou link", 120, "Avaliação no Google: cole o link de 'Pedir avaliações' do seu perfil."),
          text("password", "Senha do Wi-Fi (só no Wi-Fi)", 63),
        ],
      },
      { title: "Textos", fields: [text("title", "Título", 20), text("subtitle", "Embaixo do QR", 30)] },
      { title: "Tamanho e cores", fields: [num("width", "Largura", 60, 200, { step: 1 }), num("thickness", "Espessura", 2, 6), num("relief", "Relevo", 0.4, 3), bool("stand", "Suporte para ficar em pé"), color("plateColor", "Placa"), color("darkColor", "QR e textos")] },
    ],
    build: (ctx, p) => buildQrPlate(ctx, as(p)),
  },
  {
    id: "qrList",
    category: "plates",
    label: "Placa com vários QRs",
    blurb: "Até 4 QRs (Instagram, WhatsApp, site…) numa placa, lado a lado ou empilhados.",
    icon: LayoutGrid,
    font: true,
    defaults: DEFAULT_QR_LIST,
    sections: [
      {
        title: "QRs",
        fields: [
          text("title", "Título (opcional)", 24),
          ...[1, 2, 3, 4].flatMap((i) => [text(`label${i}`, `Rótulo ${i}`, 16), text(`link${i}`, `Link ${i} (@, telefone ou site)`, 120)]),
        ],
      },
      {
        title: "Tamanho e cores",
        fields: [
          choice("layout", "Arrumação", [
            ["horizontal", "Lado a lado"],
            ["vertical", "Empilhados"],
          ]),
          num("qrSize", "Tamanho de cada QR", 25, 60, { step: 1 }),
          num("thickness", "Espessura", 2, 6),
          num("relief", "Relevo", 0.4, 3),
          bool("stand", "Suporte para ficar em pé"),
          color("plateColor", "Placa"),
          color("darkColor", "QR e textos"),
        ],
      },
    ],
    build: (ctx, p) => buildQrList(ctx, as(p)),
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
    id: "profession",
    category: "plates",
    label: "Placa de profissão",
    blurb: "3 peças: base com peso, placa com nome e o símbolo que você enviar encaixado.",
    icon: BriefcaseBusiness,
    font: true,
    art: "Símbolo da profissão (SVG ou imagem; sem ele, estrela)",
    defaults: DEFAULT_PROFESSION,
    sections: [
      { title: "Textos", fields: [text("name", "Nome", 30), text("role", "Profissão / registro", 40)] },
      {
        title: "Encaixe e cores",
        fields: [
          num("width", "Largura", 100, 230, { step: 1 }),
          num("thickness", "Espessura da placa", 3, 8),
          num("relief", "Relevo", 0.4, 3),
          num("fit", "Folga do símbolo", 0.05, 0.6, { step: 0.05 }),
          bool("weight", "Espaço para peso na base (pausa)"),
          num("layerHeight", "Altura de camada", 0.08, 0.32, { step: 0.02, hint: "A mesma do fatiador: define a camada da pausa." }),
          color("baseColor", "Base"),
          color("plateColor", "Placa"),
          color("accentColor", "Nome e símbolo"),
        ],
      },
    ],
    build: (ctx, p) => buildProfessionPlaque(ctx, as(p)),
  },
  {
    id: "businessCard",
    category: "plates",
    label: "Cartão de visita",
    blurb: "85 × 54 com QR, e pausas opcionais para tecido e tag NFC.",
    icon: IdCard,
    font: true,
    defaults: DEFAULT_BUSINESS_CARD,
    sections: [
      { title: "Textos", fields: [text("name", "Nome", 30), text("role", "Cargo ou negócio", 36), text("phone", "Telefone", 20), text("email", "E-mail ou site", 40), text("link", "Link do QR (vazio = sem QR)", 120)] },
      {
        title: "Arrumação",
        fields: [
          choice("layout", "Arrumação", [["qrRight", "Texto + QR à direita"], ["qrLeft", "QR à esquerda"], ["qrTop", "QR em cima"], ["textOnly", "Só texto"]]),
          choice("align", "Alinhamento das linhas", [["left", "Esquerda"], ["center", "Centro"], ["right", "Direita"]]),
          choice("blockY", "Bloco de texto", [["top", "Em cima"], ["middle", "No meio"], ["bottom", "Embaixo"]]),
          num("lineGap", "Espaço entre linhas", 0, 8, { step: 0.2 }),
        ],
      },
      {
        title: "Pausas e cores",
        fields: [
          num("thickness", "Espessura", 1.2, 3),
          num("relief", "Relevo", 0.4, 1.2),
          bool("fabric", "Pausa para tecido (organza, tule)"),
          bool("nfc", "Bolsão para tag NFC"),
          num("layerHeight", "Altura de camada", 0.08, 0.32, { step: 0.02 }),
          color("cardColor", "Cartão"),
          color("textColor", "Textos e QR"),
        ],
      },
    ],
    build: (ctx, p) => buildBusinessCard(ctx, as(p)),
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
];
