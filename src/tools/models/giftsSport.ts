import { Award, BottleWine, Dumbbell, Gem, KeySquare, Lamp, Link2, Medal, Palette, RadioTower, Shield, ToggleLeft, Trophy } from "lucide-react";
import { buildAdaptiveMedal, DEFAULT_ADAPTIVE_MEDAL } from "../../geometry/models/adaptiveMedal";
import { buildAdaptiveTrophy, DEFAULT_ADAPTIVE_TROPHY } from "../../geometry/models/adaptiveTrophy";
import { buildArticulatedName, DEFAULT_ARTICULATED } from "../../geometry/models/articulatedName";
import { buildClicker, DEFAULT_CLICKER } from "../../geometry/models/clicker";
import { buildColoringTile, DEFAULT_COLORING_TILE } from "../../geometry/models/coloringTile";
import { buildGymKeychain, DEFAULT_GYM_KEYCHAIN } from "../../geometry/models/gymKeychain";
import { buildKeyHolder, DEFAULT_KEY_HOLDER } from "../../geometry/models/keyHolder";
import { buildLamp, DEFAULT_LAMP } from "../../geometry/models/lamp";
import { buildMolleTag, DEFAULT_MOLLE_TAG } from "../../geometry/models/molleTag";
import { buildNfcJewelry, DEFAULT_NFC_JEWELRY } from "../../geometry/models/nfcJewelry";
import { buildNfcTotem, DEFAULT_NFC_TOTEM } from "../../geometry/models/nfcTotem";
import { buildOpener, DEFAULT_OPENER } from "../../geometry/models/opener";
import { buildTrophy, DEFAULT_TROPHY } from "../../geometry/models/trophy";
import { as, bool, choice, color, num, text, type FieldDef, type ModelDef } from "./fields";

const nfcFields: FieldDef[] = [
  num("tagDiameter", "Diâmetro da tag", 15, 35, { hint: "NTAG213/215 redonda: 25 mm." }),
  num("tagThickness", "Espessura da tag", 0.3, 2),
  num("layerHeight", "Altura de camada", 0.08, 0.32, { step: 0.02, hint: "A mesma do fatiador: define a camada da pausa." }),
];

/** Brindes, esporte e peças funcionais (#10). Peças de encaixe expõem a folga. */
export const GIFTS_SPORT_MODELS: ModelDef[] = [
  {
    id: "adaptiveMedal",
    category: "party",
    label: "Medalha adaptável",
    blurb: "Medalha no contorno do desenho, reforçada, com alça para a fita.",
    icon: Medal,
    art: "Desenho da medalha (SVG ou imagem; colorido vira várias cores)",
    defaults: DEFAULT_ADAPTIVE_MEDAL,
    sections: [{ title: "Tamanho e cores", fields: [num("width", "Largura da arte", 30, 120, { step: 1 }), num("thickness", "Corpo", 4, 10), num("border", "Borda", 1.5, 8), num("relief", "Relevo", 0.4, 3), num("ribbon", "Largura da fita", 10, 40, { step: 1 }), color("bodyColor", "Corpo"), color("artColor", "Arte (1 cor)")] }],
    build: (ctx, p) => buildAdaptiveMedal(ctx, as(p)),
  },
  {
    id: "trophyElegant",
    category: "party",
    label: "Troféu elegante",
    blurb: "Medalhão redondo com a arte, sobre base com duas linhas de texto.",
    icon: Award,
    font: true,
    art: "Imagem do medalhão (opcional)",
    defaults: { ...DEFAULT_TROPHY, shape: "circle", size: 70, text: "", baseText: "CAMPEONATO 2026", baseText2: "1º LUGAR" },
    sections: [
      { title: "Textos", fields: [text("text", "Texto no medalhão (opcional)", 20), text("baseText", "Base: linha de cima", 26), text("baseText2", "Base: linha de baixo", 26)] },
      { title: "Tamanho e cores", fields: [num("size", "Medalhão", 40, 150, { step: 1 }), num("thickness", "Espessura", 2.5, 8), num("relief", "Relevo", 0.4, 3), color("plateColor", "Medalhão"), color("accentColor", "Borda e textos"), color("artColor", "Imagem"), color("baseColor", "Base")] },
    ],
    build: (ctx, p) => buildTrophy(ctx, as(p)),
  },
  {
    id: "adaptiveTrophy",
    category: "party",
    label: "Troféu adaptável",
    blurb: "Corpo no contorno do desenho, base original (degraus) ou compacta.",
    icon: Trophy,
    font: true,
    art: "Desenho do troféu (SVG ou imagem)",
    defaults: DEFAULT_ADAPTIVE_TROPHY,
    sections: [
      { title: "Base", fields: [text("baseText", "Base: linha de cima", 26), text("baseText2", "Base: linha de baixo (opcional)", 26), bool("compact", "Base compacta (120 × 55 mm)")] },
      { title: "Tamanho e cores", fields: [num("height", "Altura da arte", 40, 200, { step: 1 }), num("thickness", "Corpo", 4, 10), num("border", "Borda", 1.5, 8), num("relief", "Relevo", 0.4, 3), color("bodyColor", "Corpo"), color("artColor", "Arte (1 cor)"), color("baseColor", "Base"), color("textColor", "Texto da base")] },
    ],
    build: (ctx, p) => buildAdaptiveTrophy(ctx, as(p)),
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
];
