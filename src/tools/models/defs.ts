import { Bookmark, Cake, Disc3, Nfc, PencilRuler, QrCode, Stamp, Trophy } from "lucide-react";
import { buildBookmark, DEFAULT_BOOKMARK } from "../../geometry/models/bookmark";
import { buildCakeTopper, DEFAULT_CAKE_TOPPER } from "../../geometry/models/cakeTopper";
import { buildNfcKeychain, DEFAULT_NFC } from "../../geometry/models/nfcKeychain";
import { buildPenHolder, DEFAULT_PEN_HOLDER } from "../../geometry/models/penHolder";
import { buildPixPlate, DEFAULT_PIX_PLATE } from "../../geometry/models/pixPlate";
import { buildSpinner, DEFAULT_SPINNER } from "../../geometry/models/spinner";
import { buildStamp, DEFAULT_STAMP } from "../../geometry/models/stamp";
import { buildTrophy, DEFAULT_TROPHY } from "../../geometry/models/trophy";
import { parseMoney } from "../../ui/parse";
import { as, color, num, text, textureFields, type ModelDef, type Params } from "./fields";
import { GIFTS_SPORT_MODELS } from "./giftsSport";
import { STUDY_MODELS } from "./studyModels";
import { TEXT_KITCHEN_MODELS } from "./textKitchen";
import { TORNO_MODELS } from "./torno";
import { LUPA_MODELS } from "./lupa";

export { CATEGORIES, type Category, type FieldDef, type ModelDef, type Params, type Section } from "./fields";

const CORE_MODELS: ModelDef[] = [
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
    id: "cake",
    category: "party",
    label: "Topo de bolo",
    blurb: "Nome e frase em relevo, fundo contornado e palitos.",
    icon: Cake,
    font: true,
    defaults: DEFAULT_CAKE_TOPPER,
    sections: [
      { title: "Texto", fields: [text("line1", "Linha principal", 20), text("line2", "Segunda linha (opcional)", 30)] },
      { title: "Tamanho e cores", fields: [num("width", "Largura", 60, 250, { step: 1 }), { k: "stakes", kind: "choice", label: "Palitos", options: [["1", "1"], ["2", "2"]] }, num("stakeLength", "Comprimento do palito", 30, 120, { step: 1 }), num("thickness", "Espessura", 2, 6), num("relief", "Relevo", 0.4, 3), num("border", "Borda", 1.5, 8), color("baseColor", "Fundo"), color("textColor", "Texto")] },
    ],
    build: (ctx, p) => buildCakeTopper(ctx, as({ ...p, stakes: Number(p.stakes) })),
  },
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
    id: "bookmark",
    category: "home",
    label: "Marca-página",
    blurb: "Tira com furo para cordão, texto ao longo e desenho no topo.",
    icon: Bookmark,
    font: true,
    art: "Desenho no topo (opcional)",
    defaults: DEFAULT_BOOKMARK,
    sections: [
      { title: "Texto", fields: [text("text", "Texto", 30)] },
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
      { title: "Tamanho e cores", fields: [{ k: "shape", kind: "choice", label: "Formato", options: [["circle", "Redondo"], ["square", "Quadrado"]] }, num("size", "Tamanho", 30, 70, { step: 1 }), num("relief", "Relevo", 0.4, 2), color("baseColor", "Base"), color("textColor", "Texto")] },
    ],
    build: (ctx, p) => buildNfcKeychain(ctx, as(p)),
  },
  {
    id: "trophy",
    category: "party",
    label: "Troféu",
    blurb: "Placa com texto e imagem que encaixa numa base com degrau.",
    icon: Trophy,
    font: true,
    art: "Imagem no centro (opcional)",
    defaults: DEFAULT_TROPHY,
    sections: [
      { title: "Textos", fields: [text("text", "Texto na placa", 20), text("baseText", "Texto na base (opcional)", 24)] },
      { title: "Tamanho e cores", fields: [{ k: "shape", kind: "choice", label: "Formato", options: [["star", "Estrela"], ["circle", "Redondo"], ["shield", "Escudo"], ["hexagon", "Hexágono"]] }, num("size", "Tamanho", 40, 180, { step: 1 }), num("thickness", "Espessura", 2.5, 8), num("relief", "Relevo", 0.4, 3), color("plateColor", "Placa"), color("accentColor", "Borda e textos"), color("artColor", "Imagem"), color("baseColor", "Base")] },
    ],
    build: (ctx, p) => buildTrophy(ctx, as(p)),
  },
];

export const MODELS: ModelDef[] = [...CORE_MODELS, ...TEXT_KITCHEN_MODELS, ...GIFTS_SPORT_MODELS, ...STUDY_MODELS, ...TORNO_MODELS, ...LUPA_MODELS];

/** Números dentro dos limites (os campos fora da faixa ficam marcados e não geram o modelo). */
export function validParams(def: ModelDef, p: Params): boolean {
  return def.sections.every((s) => s.fields.every((f) => f.kind !== "num" || (Number.isFinite(p[f.k]) && (p[f.k] as number) >= f.min && (p[f.k] as number) <= f.max)));
}
