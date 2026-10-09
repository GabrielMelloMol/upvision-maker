import { BriefcaseBusiness, Disc3, Frame, IdCard, LayoutGrid, Palette, QrCode, RadioTower, Shield, Signpost, Sparkles, Users } from "lucide-react";
import { buildBusinessCard, DEFAULT_BUSINESS_CARD } from "../../../geometry/models/businessCard";
import { buildColoringTile, DEFAULT_COLORING_TILE } from "../../../geometry/models/coloringTile";
import { buildLogoPlate, DEFAULT_ADAPTIVE_PLATE } from "../../../geometry/models/logoPlate";
import { buildMolleTag, DEFAULT_MOLLE_TAG } from "../../../geometry/models/molleTag";
import { buildMusicCard, DEFAULT_MUSIC_CARD } from "../../../geometry/models/musicCard";
import { buildNamesPanel, DEFAULT_NAMES_PANEL } from "../../../geometry/models/namesPanel";
import { buildNfcTotem, DEFAULT_NFC_TOTEM } from "../../../geometry/models/nfcTotem";
import { buildPixPlate, DEFAULT_PIX_PLATE } from "../../../geometry/models/pixPlate";
import { buildProfessionPlaque, DEFAULT_PROFESSION } from "../../../geometry/models/professionPlaque";
import { buildQrList, buildQrPlate, DEFAULT_QR_LIST, DEFAULT_QR_PLATE } from "../../../geometry/models/qrPlate";
import { buildStarMap, DEFAULT_STAR_MAP } from "../../../geometry/models/starMap";
import { CITIES } from "../../../geometry/models/starSky";
import { buildSignPlate, DEFAULT_SIGN_PLATE } from "../../../geometry/models/signPlate";
import { parseMoney } from "../../../ui/parse";
import { as, bool, choice, color, logoFields, nfcFields, num, resinFields, text, textureFields, type ModelDef } from "../fields";

/** Modelos prontos da categoria Placas. */
export const PLATE_MODELS: ModelDef[] = [
  {
    id: "pix",
    category: "plates",
    label: "Placa Pix",
    blurb: "Placa de balcão com QR do Pix, título e nome; suporte inclinado.",
    icon: QrCode,
    font: true,
    fontSection: 1,
    defaults: { ...DEFAULT_PIX_PLATE, amountText: "" },
    sections: [
      { title: "Pix", fields: [text("key", "Chave Pix", 77, "CPF, CNPJ, telefone, e-mail ou aleatória."), text("name", "Nome de quem recebe", 60), text("city", "Cidade", 40), { k: "amountText", kind: "money", label: "Valor fixo (opcional)", hint: "Vazio: quem paga digita." }] },
      { title: "Textos", fields: [text("title", "Título", 20), text("subtitle", "Embaixo do QR", 30)] },
      { title: "Tamanho e cores", fields: [num("width", "Largura", 60, 200, { step: 1 }), num("thickness", "Espessura", 2, 6), num("relief", "Relevo", 0.4, 3), { k: "stand", kind: "bool", label: "Suporte para ficar em pé" }, color("plateColor", "Placa"), color("darkColor", "QR e textos"), ...textureFields] },
    ],
    build: (ctx, p) => {
      const amount = parseMoney(String(p.amountText));
      return buildPixPlate(ctx, as({ ...p, amount: Number.isFinite(amount) ? amount : 0 }));
    },
  },
  {
    id: "musicCard",
    category: "plates",
    label: "Cartão de música",
    blurb: "Placa com foto, título, artista, trecho da letra, barra de progresso e botões de player de desenho nosso. De mesa ou com ímã.",
    icon: Disc3,
    font: true,
    fontSection: 1,
    art: "Foto ou desenho (opcional)",
    defaults: DEFAULT_MUSIC_CARD,
    sections: [
      { title: "Música", fields: [text("title", "Título", 30), text("artist", "Artista ou dupla", 30), text("line1", "Letra, linha 1", 36), text("line2", "Letra, linha 2", 36), text("line3", "Letra, linha 3", 36), text("line4", "Letra, linha 4", 36)] },
      {
        title: "Player",
        fields: [
          num("progress", "Trecho tocado", 0, 100, { step: 1, unit: "%" }),
          text("timeStart", "Tempo de início", 6),
          text("timeEnd", "Tempo final", 6),
          bool("showButtons", "Botões de anterior, tocar e próxima"),
          num("artHeight", "Altura da foto (1 = quadrada)", 0.4, 1.4, { step: 0.05, unit: "" }),
        ],
      },
      {
        title: "Tamanho e cores",
        fields: [
          num("width", "Largura", 80, 110, { step: 1, hint: "Até 110 mm: com foto quadrada o conjunto ainda cabe na mesa de 256 mm." }),
          num("thickness", "Espessura", 2.4, 6),
          num("relief", "Relevo", 0.4, 2),
          choice("mount", "Fixação", [["stand", "Suporte de mesa"], ["magnet", "Ímã atrás"], ["none", "Nenhuma"]]),
          color("plateColor", "Placa"),
          color("textColor", "Textos e foto (1 cor)"),
          color("accentColor", "Destaque (progresso e tocar)"),
        ],
      },
    ],
    build: (ctx, p) => buildMusicCard(ctx, as(p)),
  },
  {
    id: "adaptivePlate",
    category: "plates",
    label: "Placa adaptável",
    blurb: "Placa que segue o contorno do desenho, para parede ou mesa.",
    icon: Frame,
    art: "Desenho da placa (SVG ou imagem)",
    defaults: DEFAULT_ADAPTIVE_PLATE,
    sections: [{ title: "Tamanho e cores", fields: [...logoFields(250), color("baseColor", "Base"), color("artColor", "Arte (1 cor)"), ...textureFields, ...resinFields] }],
    build: (ctx, p) => buildLogoPlate(ctx, as({ ...p, ring: false })),
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
          ...textureFields,
        ],
      },
    ],
    build: (ctx, p) => buildSignPlate(ctx, as(p)),
  },
  {
    id: "molle",
    category: "plates",
    label: "MOLLE tag",
    blurb: "Placa 118 × 72 com 4 rasgos para fitas MOLLE (mochila, colete).",
    icon: Shield,
    font: true,
    art: "Arte (opcional)",
    defaults: DEFAULT_MOLLE_TAG,
    sections: [
      { title: "Arte", fields: [text("text", "Texto (sem desenho)", 16)] },
      { title: "Encaixe e cores", fields: [num("strap", "Rasgo da fita", 2, 6, { step: 0.1, hint: "Espessura da fita + folga." }), num("thickness", "Espessura", 3, 6), num("relief", "Relevo", 0.4, 3), color("plateColor", "Placa"), color("artColor", "Arte (1 cor)")] },
    ],
    build: (ctx, p) => buildMolleTag(ctx, as(p)),
  },
  {
    id: "coloring",
    category: "plates",
    label: "Plaquinha de colorir",
    blurb: "Traços do desenho em relevo formando áreas para pintar.",
    icon: Palette,
    art: "Desenho (SVG ou imagem)",
    defaults: DEFAULT_COLORING_TILE,
    sections: [
      {
        title: "Traços",
        fields: [
          choice("style", "Modo", [["raised", "Relevo"], ["recessed", "Rebaixado"], ["twoPiece", "2 peças"], ["marquetry", "Marchetaria"]]),
          choice("mode", "Traço", [["outline", "Contorno das áreas"], ["lines", "Linhas do desenho"]]),
          num("line", "Largura do traço", 0.8, 3, { step: 0.1 }),
          num("wall", "Altura do traço", 0.8, 4),
          num("clearance", "Folga dos encaixes", 0.1, 0.5, { step: 0.05 }),
        ],
      },
      { title: "Tamanho e cores", fields: [num("size", "Tamanho", 40, 200, { step: 1 }), num("thickness", "Placa", 1.2, 4), color("plateColor", "Placa"), color("lineColor", "Traços")] },
    ],
    build: (ctx, p) => buildColoringTile(ctx, as(p)),
  },
  {
    id: "nfcTotem",
    category: "plates",
    label: "Totem NFC",
    blurb: "Placa de balcão com tag NFC embutida (pausa) e base.",
    icon: RadioTower,
    font: true,
    art: "Logo no topo (opcional)",
    defaults: DEFAULT_NFC_TOTEM,
    sections: [
      { title: "Textos", fields: [text("title", "Título", 20), text("text", "Frase", 30), text("baseText", "Texto na base (opcional)", 26)] },
      { title: "Tag e impressão", fields: nfcFields },
      { title: "Tamanho e cores", fields: [num("width", "Largura", 50, 150, { step: 1 }), num("height", "Altura", 70, 200, { step: 1 }), num("relief", "Relevo", 0.4, 2), color("plateColor", "Placa"), color("accentColor", "Textos e base")] },
    ],
    build: (ctx, p) => buildNfcTotem(ctx, as(p)),
  },
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
          num("width", "Largura", 60, 600, { step: 1, hint: "Maior que a mesa da impressora, sai em partes para colar." }),
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
    id: "starMap",
    category: "plates",
    label: "Mapa estelar de uma data",
    blurb: "O céu de um lugar e de um momento em relevo, com título e data. Cálculo offline com o catálogo de estrelas brilhantes. De mesa ou com ímã.",
    icon: Sparkles,
    font: true,
    defaults: DEFAULT_STAR_MAP,
    sections: [
      {
        title: "Lugar",
        fields: [
          choice("city", "Cidade", [...CITIES.map(([id, name]) => [id, name] as const), ["custom", "Outra (latitude e longitude)"]]),
          num("lat", "Latitude (só em \"Outra\")", -90, 90, { step: 0.01, unit: "°", hint: "Sul é negativo." }),
          num("lon", "Longitude (só em \"Outra\")", -180, 180, { step: 0.01, unit: "°", hint: "Oeste é negativo." }),
        ],
      },
      {
        title: "Data e hora",
        fields: [
          num("day", "Dia", 1, 31, { step: 1 }),
          num("month", "Mês", 1, 12, { step: 1 }),
          num("year", "Ano", 1900, 2100, { step: 1 }),
          num("hour", "Hora", 0, 23, { step: 1 }),
          num("minute", "Minuto", 0, 59, { step: 1 }),
          num("utcOffset", "Fuso (horas)", -12, 14, { step: 0.5, hint: "Brasília: -3. Em datas com horário de verão, some 1." }),
        ],
      },
      { title: "Texto", fields: [text("title", "Título", 28), text("caption", "Legenda (vazio = data e cidade)", 40)] },
      {
        title: "Céu e placa",
        fields: [
          num("maxMag", "Estrelas até a magnitude", 3, 5, { step: 0.1, hint: "Maior = mais estrelas, mais fracas e mais miúdas." }),
          num("starScale", "Tamanho das estrelas", 0.7, 1.6, { step: 0.05, unit: "" }),
          bool("lines", "Linhas das constelações"),
          num("width", "Largura da placa", 80, 180, { step: 1 }),
          num("thickness", "Espessura", 2, 8),
          num("relief", "Relevo", 0.4, 2),
          choice("mount", "Apoio", [["stand", "Suporte de mesa"], ["magnet", "Ímã atrás"], ["none", "Nenhum"]]),
          color("plateColor", "Placa"),
          color("starColor", "Estrelas e texto"),
        ],
      },
    ],
    build: (ctx, p) => buildStarMap(ctx, as(p)),
  },
];
