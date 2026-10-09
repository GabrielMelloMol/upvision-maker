import { PAGE_ALIASES } from "../../ui/pageAliases";
import { MODELS } from "./defs";
import { familyOf, modelOf } from "./families";
import { COLLECTIONS, inCollection } from "./variants";

/**
 * Busca de ferramentas e Modelos prontos (a Criar, a galeria e o ⌘K usam esta): minúsculas, sem acento e sem hífen,
 * todas as palavras precisam aparecer (em qualquer ordem), com nomes que a vendedora usa ("camiseta", "abajur") e as
 * ocasiões de cada modelo ("Dia das Mães" acha o que está na coleção).
 */
export const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const clean = (s: string) => normalize(s).replace(/[-–—/·→]+/g, " ");
export const queryWords = (q: string): string[] => clean(q).split(/\s+/).filter(Boolean);

/** Palavras que a pessoa digita e o nome técnico não tem. Por id do modelo. */
export const MODEL_ALIASES: Record<string, string> = {
  fridgeMagnet: "imã ima geladeira magnético lembrancinha souvenir",
  shirtPrint: "camiseta camisa roupa blusa tecido transfer ferro de passar estampar",
  coaster: "porta copos descanso de copo bolacha mesa",
  tableLamp: "abajur luminária de mesa luz lâmpada led",
  lamp: "luminária luz led abajur letreiro iluminado",
  ledLetter: "letra iluminada luminosa luz led neon",
  rpgDice: "dado dados d20 d6 jogo de tabuleiro mesa rpg d&d",
  keycap: "tecla teclado mecânico keycap switch cherry mx",
  clicker: "tecla teclado mecânico clique fidget antiestresse",
  phoneStand: "celular suporte tablet apoio de mesa smartphone iphone",
  phoneStandFold: "celular suporte dobrável dobra viagem bolsa tablet smartphone",
  phoneKeychain: "celular suporte abridor lata chaveiro",
  keyHolder: "porta chaves chaveiro de parede ganchos pendurar chaves",
  photoHolder: "porta retrato retrato polaroid foto moldura",
  windowFrame: "moldura shaker glitter acetato topo de bolo",
  bigFrame: "moldura pôster poster quadro grande",
  starMap: "mapa estelar céu estrelas constelação constelações noite data presente",
  shadowbox: "quadro camadas profundidade caixa de luz 3d papercut recorte",
  cake: "topo de bolo bolo aniversário festa parabéns",
  stickStand: "pirulito cake pop palitos doces festa",
  cakeStand: "boleira prato bolo mesa de doces",
  petTag: "pet cachorro gato coleira identificação plaquinha",
  pix: "pix qr placa balcão pagamento loja",
  qrPlate: "qr code placa balcão wifi whatsapp instagram avaliação",
  bookmark: "marca página marcador de livro leitura",
  vase: "vaso planta decoração flor",
  plantMarker: "planta horta placa terra jardim",
  puzzle: "quebra cabeça jogo brinquedo foto",
  alphabetCube: "cubo letras alfabeto brinquedo bebê nome",
  coloring: "colorir pintar criança desenho",
  lineArt: "desenho em pé quadro vazado line art",
  stringArt: "string art fios pregos linhas",
  goalBoard: "metas economia contagem regressiva riscar",
  trophy: "troféu taça prêmio campeão",
  adaptiveMedal: "medalha prêmio formatura fita",
  gridBin: "gridfinity caixinha gaveta organizador divisórias",
  gridBase: "gridfinity base gaveta organizador",
  gridDrawerBase: "gridfinity gaveta organizador medir",
  deskOrganizer: "organizador de mesa gaveta bandeja escritório",
  lidBox: "caixa com tampa organizador presente",
  screwCase: "estojo porta batom rosca tampa",
  pen: "porta caneta lápis copo escritório",
  stamp: "carimbo brigadeiro biscoito sabonete",
  cutterStamp: "cortador de biscoito bolacha carimbo",
  nfc: "nfc cartão tag aproximação chaveiro",
  opener: "abridor garrafa lata chaveiro",
  spinner: "giratório gira chaveiro fidget",
  ornamentSpinner: "enfeite árvore de natal bola giratório pendurar",
  snowflake: "floco de neve natal enfeite pendurar",
  layeredSign: "letreiro placa nome camadas letras",
  wallLetters: "letras parede decoração nome quarto",
  businessCard: "cartão de visita contato empresa qr",
  musicCard: "cartão de música spotify placa foto música",
  namesPanel: "painel de nomes turma família equipe lista",
  sign: "sinalização placa aviso porta ícone",
  profession: "profissão placa formatura médico advogado",
};

const occasionLabels = (id: string): string[] => COLLECTIONS.filter(([c]) => inCollection(id, c)).map(([, label]) => label);

/** Tudo o que a busca olha num modelo, em 3 camadas: nome, "onde fica" (família e variação) e o resto (sinônimos, ocasiões, descrição). */
function layers(id: string): [title: string, where: string, rest: string] {
  const m = modelOf(id), f = familyOf(id);
  return [clean(m.label), clean(`${f.label} ${f.variants.find((v) => v.id === id)?.label ?? ""}`), clean(`${MODEL_ALIASES[id] ?? ""} ${occasionLabels(id).join(" ")} ${m.blurb}`)];
}

/** Quanto o modelo combina com a busca: 0 = o nome tem tudo; 1 = nome, família e variação; 2 = com sinônimos e ocasiões; 3 = só pela descrição; null = não combina. */
export function modelScore(id: string, q: string): number | null {
  const words = queryWords(q);
  if (!words.length) return null;
  const [title, where, rest] = layers(id);
  const has = (hay: string) => words.every((w) => hay.includes(w));
  if (has(title)) return 0;
  if (has(`${title} ${where}`)) return 1;
  const aliasesAndOccasions = clean(`${MODEL_ALIASES[id] ?? ""} ${occasionLabels(id).join(" ")}`);
  if (has(`${title} ${where} ${aliasesAndOccasions}`)) return 2;
  return has(`${title} ${where} ${rest}`) ? 3 : null;
}

/** Os modelos que combinam com a busca, do que mais combina para o que menos (empate: a ordem do catálogo). */
export const searchModels = (q: string): string[] =>
  MODELS.map((m, i) => ({ id: m.id, i, s: modelScore(m.id, q) }))
    .filter((x): x is { id: string; i: number; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.id);

/** Texto de busca de uma ferramenta (nome, descrição e sinônimos). */
export const toolText = (id: string, label: string, blurb = ""): string => `${label} ${blurb} ${PAGE_ALIASES[id] ?? ""}`;

/** Todas as palavras da busca aparecem no texto? Sem busca, tudo combina. */
export const matchesAll = (text: string, q: string): boolean => {
  const words = queryWords(q);
  const hay = clean(text);
  return words.every((w) => hay.includes(w));
};

/** Texto de busca de um modelo (para a Criar e o ⌘K): nome, descrição, sinônimos e ocasiões. */
export const modelText = (id: string): string => {
  const m = modelOf(id), f = familyOf(id);
  return `${m.label} ${f.label} ${m.blurb} ${MODEL_ALIASES[id] ?? ""} ${occasionLabels(id).join(" ")}`;
};
