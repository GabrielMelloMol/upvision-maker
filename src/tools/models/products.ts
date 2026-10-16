import type { Category } from "./defs";
import { CATEGORIES } from "./defs";
import { familiesIn, modelOf, type Family } from "./families";

/*
 * Os produtos da Criar (#250): o que a pessoa vende ou quer fazer, em cartões com foto. Um produto é uma família de
 * Modelos prontos (Chaveiro, Placa de balcão…) ou uma ferramenta com tela própria que também é produto (Litofania,
 * Convite, Caixinha termoformada…). Cada produto tem uma frase do que resolve e as "entradas" que abre: as variações
 * (modelos) e os atalhos para ferramentas. As ferramentas de arquivo (vetor, dividir STL…) ficam à parte, em 3 grupos.
 */
export type Entry = { kind: "model"; id: string; label: string } | { kind: "tool"; page: string; label: string; intent?: unknown };
export type Product = { id: string; label: string; category: Category; /** o que o produto resolve, numa frase */ blurb: string; entries: Entry[] };

/** O que cada família resolve, na voz de quem vende (uma frase, sem ponto final). */
export const PRODUCT_BLURB: Record<string, string> = {
  starMap: "O céu de uma data especial, para presentear",
  musicCard: "Placa com a foto e o QR da música preferida",
  counterPlate: "Placa de balcão com Pix, QR, Wi-Fi ou NFC",
  plate: "Placas de sinalização, profissão e nomes",
  businessCard: "Cartão de visita em relevo, com QR",
  idTag: "Plaquinha de pet e tag de identificação",
  keychain: "Chaveiro com nome, logo, NFC ou academia",
  names: "Nome articulado, pingentes e topo de lápis",
  trophy: "Troféu para campeonato, formatura ou brincadeira",
  medal: "Medalha com texto, imagem e alça para fita",
  souvenirs: "Ímã, estampa de camisa e cumbuca de lembrança",
  cake: "Topo de bolo com o nome e o tema da festa",
  christmas: "Floco de neve e enfeites giratórios de Natal",
  letters: "Letreiro, letra grande e letra com luz",
  pegboard: "Painel perfurado com ganchos para a oficina",
  frame: "Moldura com glitter, porta-foto e quadros grandes",
  lamp: "Luminária e abajur de mesa personalizados",
  wallArt: "String art, shadowbox, azulejo e quadro vazado",
  containers: "Porta-caneta, caixas com divisórias e capas",
  gridfinity: "Caixinhas que se encaixam para organizar gavetas",
  vase: "Vaso decorativo para plantas e flores",
  toys: "Quebra-cabeça, dados, colorir e estilingue",
  assembleKits: "Carro, avião, bicho e baú para montar",
  coaster: "Porta-copos com nome ou desenho",
  phoneStand: "Suporte de celular e tablet fixo ou dobrável",
  bookHolder: "Apoio para livro, de mesa ou de polegar",
  bookmark: "Marca-página e clipe de papel personalizados",
  keycap: "Tecla de teclado mecânico com sua arte",
  keyHolder: "Porta-chave de parede com ganchos",
  utilities: "Arruela, botão, pente de cabos e peças de reparo",
  mechanics: "Engrenagem, polia, correia e corrente",
  sweetsTable: "Boleira e palitos para a mesa de doces",
  stamps: "Carimbos para brigadeiro, EVA e papel sem tinta",
  cutters: "Cortador de biscoito, ejetor e forma de docinho",
  cupHandle: "Alça removível para copo térmico",
  sinkFunnel: "Tampa de ralo e funil de cozinha",
  jigs: "Gabaritos para furar, medir raios e alinhar etiqueta",
  bagClip: "Clipe para fechar saco de pão e de café",
  lithophane: "Foto que ganha vida quando a luz passa por trás",
  invite: "Convite envelope com renda, tule e borboleta",
  thermoform: "Caixinha de presente em malha prensada a quente",
  pixelMosaic: "Pixel art e mosaico nas cores dos seus filamentos",
};

/** Ferramentas com tela própria que também são produto (o cartão mora na categoria, como uma família). */
const TOOL_PRODUCTS: Product[] = [
  { id: "lithophane", label: "Litofania (foto que acende)", category: "home", blurb: PRODUCT_BLURB.lithophane, entries: [{ kind: "tool", page: "lithophane", label: "Litofania" }] },
  { id: "invite", label: "Convite envelope", category: "party", blurb: PRODUCT_BLURB.invite, entries: [{ kind: "tool", page: "invite", label: "Convite envelope" }] },
  { id: "thermoform", label: "Caixinha termoformada", category: "gifts", blurb: PRODUCT_BLURB.thermoform, entries: [{ kind: "tool", page: "thermoform", label: "Caixinha termoformada" }] },
  { id: "pixelMosaic", label: "Pixel art e mosaico", category: "gifts", blurb: PRODUCT_BLURB.pixelMosaic, entries: [{ kind: "tool", page: "pixel", label: "Pixel art" }, { kind: "tool", page: "mosaic", label: "Mosaico" }] },
];

/** Ferramentas para quem já tem um arquivo ou imagem, em 3 grupos (de 24 cartões soltos, #250). */
export const FILE_TOOL_GROUPS: { id: "image" | "files" | "help"; title: string; tab: "file" | "help"; pages: string[] }[] = [
  { id: "image", title: "Da imagem para a peça", tab: "file", pages: ["svg", "extrude"] },
  { id: "files", title: "Mexer num arquivo 3D seu", tab: "file", pages: ["owndecal", "texturize", "bedcut", "partialcut", "mold", "lighten", "colorsplit", "protect"] },
  { id: "help", title: "Não achou?", tab: "help", pages: ["search3d", "ai", "scad"] },
];
export const FILE_TOOLS = FILE_TOOL_GROUPS.flatMap((g) => g.pages);

/** As abas da Criar: "Tudo", uma por categoria de produto, e as duas de ferramentas. Todo produto e toda ferramenta cai em uma delas. */
export type Tab = "all" | Category | "file" | "help";
export const TABS: (readonly [Tab, string])[] = [["all", "Tudo"], ...CATEGORIES.map(([c, label]) => [c, label] as const), ["file", "Do seu arquivo"], ["help", "Não achou?"]];

/** A família vira produto: atalhos "primeiro" antes das variações e os outros depois (a ordem do seletor de variação). */
function ofFamily(f: Family): Product {
  const tools = f.tools ?? [];
  const toEntry = (t: NonNullable<Family["tools"]>[number]): Entry => ({ kind: "tool", page: t.page, label: t.label, intent: t.intent });
  const entries: Entry[] = [
    ...tools.filter((t) => t.first).map(toEntry),
    ...f.variants.map((v): Entry => ({ kind: "model", id: v.id, label: v.label })),
    ...tools.filter((t) => !t.first).map(toEntry),
  ];
  return { id: f.id, label: f.label, category: f.category, blurb: PRODUCT_BLURB[f.id] ?? modelOf(f.variants[0].id).blurb, entries };
}

/** Os produtos de uma categoria, na ordem da galeria (famílias e depois as ferramentas que também são produto). */
export const productsIn = (c: Category): Product[] => [...familiesIn(c).map(ofFamily), ...TOOL_PRODUCTS.filter((p) => p.category === c)];
export const PRODUCTS: Product[] = CATEGORIES.flatMap(([c]) => productsIn(c));

/** O que o cartão abre sem busca: a ferramenta principal se a família tem só 1 modelo (Medalha), senão a 1ª variação. */
export function defaultEntry(p: Product, allowed: (e: Entry) => boolean = () => true): Entry {
  const entries = p.entries.filter(allowed);
  const models = entries.filter((e) => e.kind === "model");
  return models.length >= 2 ? models[0] : (entries[0] ?? p.entries[0]);
}

/** Quantos tipos o cartão tem ("12 tipos"); produto de um tipo só não diz nada. */
export const typesOf = (p: Product): string | null => (p.entries.length > 1 ? `${p.entries.length} tipos` : null);

/** Aba (que não é "Tudo") de cada ferramenta de arquivo, para o teste e a Criar. */
export const toolTab = (page: string): "file" | "help" | undefined => FILE_TOOL_GROUPS.find((g) => g.pages.includes(page))?.tab;

/** Páginas de ferramenta que já são entrada de algum produto (variação ou atalho). */
export const productPages = (): Set<string> => new Set(PRODUCTS.flatMap((p) => p.entries).flatMap((e) => (e.kind === "tool" ? [e.page] : [])));
