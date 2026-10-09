import { MODELS, type Category, type ModelDef, type Params } from "./defs";

/*
 * Famílias dos Modelos prontos (#141, docs/design/familias-modelos.md): 1 card por família na galeria e, dentro dela,
 * as variações (os modelos de hoje, com o mesmo id). É só apresentação: rascunhos, variações salvas, estilos,
 * coleções, miniaturas, perfis e QA continuam pelo id do modelo, sem migração.
 */
export type FamilyVariant = { id: string; label: string; group?: string };
/** Atalho para uma ferramenta com tela própria (Chaveiros, Medalhas, Cortador, QR, Organizador de gaveta). */
export type FamilyTool = { page: string; label: string; first?: boolean };
export type Family = { id: string; label: string; category: Category; variants: FamilyVariant[]; tools?: FamilyTool[] };

const ART = "Com arte", FN = "Com função";

export const FAMILIES: Family[] = [
  { id: "musicCard", label: "Cartão de música", category: "plates", variants: [{ id: "musicCard", label: "Cartão de música" }] },
  { id: "counterPlate", label: "Placa de balcão", category: "plates", variants: [{ id: "pix", label: "Pix" }, { id: "qrPlate", label: "QR" }, { id: "qrList", label: "Vários QRs" }, { id: "nfcTotem", label: "NFC" }], tools: [{ page: "qr", label: "QR e Pix" }] },
  { id: "plate", label: "Placa", category: "plates", variants: [{ id: "sign", label: "Sinalização" }, { id: "adaptivePlate", label: "No contorno" }, { id: "profession", label: "Profissão" }, { id: "namesPanel", label: "Painel nomes" }, { id: "starMap", label: "Mapa estelar" }] },
  { id: "businessCard", label: "Cartão de visita", category: "plates", variants: [{ id: "businessCard", label: "Cartão de visita" }] },
  { id: "idTag", label: "Tag de identificação", category: "keychains", variants: [{ id: "petTag", label: "Pet" }, { id: "molle", label: "MOLLE" }] },
  {
    id: "keychain",
    label: "Chaveiro",
    category: "keychains",
    variants: [
      { id: "logoKeychain", label: "Logo", group: ART },
      { id: "nfc", label: "NFC", group: ART },
      { id: "gymKeychain", label: "Anilha", group: ART },
      { id: "mirror", label: "Espelho", group: FN },
      { id: "opener", label: "Abridor", group: FN },
      { id: "phoneKeychain", label: "Apoio celular", group: FN },
      { id: "spinner", label: "Giratório", group: FN },
      { id: "clicker", label: "Clicker", group: FN },
    ],
    tools: [{ page: "keychain", label: "Nome em lote", first: true }],
  },
  { id: "names", label: "Nomes", category: "keychains", variants: [{ id: "articulatedName", label: "Articulado" }, { id: "namePendants", label: "Pingentes" }, { id: "pencilTopper", label: "Topo de lápis" }] },
  { id: "trophy", label: "Troféu", category: "party", variants: [{ id: "trophy", label: "Placa na base" }, { id: "trophyElegant", label: "Elegante" }, { id: "adaptiveTrophy", label: "No contorno" }] },
  { id: "medal", label: "Medalha", category: "party", variants: [{ id: "adaptiveMedal", label: "No contorno" }], tools: [{ page: "medal", label: "Redonda", first: true }] },
  { id: "souvenirs", label: "Lembrancinhas", category: "party", variants: [{ id: "fridgeMagnet", label: "Ímã geladeira" }, { id: "shirtPrint", label: "Estampa" }] },
  { id: "cake", label: "Topo de bolo", category: "party", variants: [{ id: "cake", label: "Topo de bolo" }] },
  { id: "christmas", label: "Enfeite de Natal", category: "party", variants: [{ id: "snowflake", label: "Floco de neve" }, { id: "ornamentSpinner", label: "Giratório" }] },
  { id: "letters", label: "Letras e palavras", category: "party", variants: [{ id: "layeredSign", label: "Letreiro" }, { id: "wallLetters", label: "Letras parede" }, { id: "bigLetter", label: "Letra grande" }, { id: "ledLetter", label: "Letra LED" }, { id: "wordDecor", label: "Encaixadas" }] },
  { id: "frame", label: "Moldura", category: "home", variants: [{ id: "windowFrame", label: "Shaker" }, { id: "photoHolder", label: "Porta-foto" }] },
  { id: "wallArt", label: "Quadro e desenho", category: "home", variants: [{ id: "stringArt", label: "String art" }, { id: "lineArt", label: "Desenho em pé" }, { id: "coloring", label: "Colorir" }, { id: "goalBoard", label: "Metas" }, { id: "shadowbox", label: "Shadowbox" }, { id: "reliefTile", label: "Azulejo" }, { id: "cutoutFrame", label: "Quadro vazado" }, { id: "cutoutStand", label: "Vazada em pé" }] },
  { id: "containers", label: "Potes e organizadores", category: "home", variants: [{ id: "pen", label: "Porta-caneta" }, { id: "deskOrganizer", label: "Organizador" }, { id: "lidBox", label: "Com tampa" }, { id: "screwCase", label: "Estojo rosca" }, { id: "nfcJewelry", label: "Porta-joia NFC" }, { id: "outlineBowl", label: "Cumbuca" }] },
  {
    id: "gridfinity",
    label: "Gridfinity",
    category: "home",
    variants: [{ id: "gridBin", label: "Caixinha" }, { id: "gridBase", label: "Base" }, { id: "gridDrawerBase", label: "Base gaveta" }, { id: "gridTest", label: "Teste encaixe" }, { id: "ruler3d", label: "Régua de 25 cm" }],
    tools: [{ page: "drawer", label: "Na gaveta" }],
  },
  { id: "lamp", label: "Luminária", category: "home", variants: [{ id: "lamp", label: "Luminária" }] },
  { id: "tableLamp", label: "Abajur de mesa", category: "home", variants: [{ id: "tableLamp", label: "Abajur de mesa" }] },
  { id: "vase", label: "Vaso", category: "home", variants: [{ id: "vase", label: "Vaso" }] },
  { id: "toys", label: "Brinquedos", category: "home", variants: [{ id: "puzzle", label: "Quebra-cabeça" }, { id: "alphabetCube", label: "Cubo alfabeto" }, { id: "rpgDice", label: "Dados de RPG" }] },
  { id: "coaster", label: "Porta-copos", category: "home", variants: [{ id: "coaster", label: "Porta-copos" }] },
  { id: "phoneStand", label: "Suporte de celular e tablet", category: "home", variants: [{ id: "phoneStand", label: "Suporte de celular e tablet" }] },
  { id: "bigFrame", label: "Moldura grande dividida", category: "home", variants: [{ id: "bigFrame", label: "Moldura grande dividida" }] },
  { id: "bookmark", label: "Marca-página", category: "home", variants: [{ id: "bookmark", label: "Marca-página" }] },
  { id: "keycap", label: "Tecla de teclado", category: "home", variants: [{ id: "keycap", label: "Tecla de teclado" }] },
  { id: "keyHolder", label: "Porta-chave de parede", category: "home", variants: [{ id: "keyHolder", label: "Porta-chave de parede" }] },
  { id: "utilities", label: "Utilitários", category: "home", variants: [{ id: "spacer", label: "Arruela" }, { id: "plantMarker", label: "Marcador" }, { id: "cableComb", label: "Pente de cabos" }, { id: "knob", label: "Botão" }, { id: "hoseAdapter", label: "Mangueira" }] },
  { id: "sweetsTable", label: "Mesa de doces", category: "kitchen", variants: [{ id: "cakeStand", label: "Boleira" }, { id: "stickStand", label: "Palitos" }] },
  { id: "stamps", label: "Carimbos e texturas", category: "kitchen", variants: [{ id: "stamp", label: "Carimbo" }, { id: "stampMold", label: "Molde de EVA" }, { id: "textureRoller", label: "Rolo textura" }] },
  { id: "cutters", label: "Cortadores e formas", category: "kitchen", variants: [{ id: "cutterStamp", label: "Com carimbo" }, { id: "gridCutter", label: "Em grade" }, { id: "ejector", label: "Ejetor" }], tools: [{ page: "cutter", label: "Biscoito" }] },
  { id: "bagClip", label: "Clipe de saco", category: "kitchen", variants: [{ id: "bagClip", label: "Clipe de saco" }] },
];

const byModel = new Map(FAMILIES.flatMap((f) => f.variants.map((v) => [v.id, f] as const)));

/** A família de um modelo (todo modelo tem uma; um modelo novo sem família cai numa família só dele). */
export function familyOf(modelId: string): Family {
  const f = byModel.get(modelId);
  if (f) return f;
  const m = MODELS.find((x) => x.id === modelId)!;
  return { id: m.id, label: m.label, category: m.category, variants: [{ id: m.id, label: m.label }] };
}

export const variantLabel = (modelId: string) => familyOf(modelId).variants.find((v) => v.id === modelId)?.label ?? modelId;

/** Modelo da variação (para ícone, miniatura e texto do card). */
export const modelOf = (id: string): ModelDef => MODELS.find((m) => m.id === id)!;

/** Famílias de uma categoria, na ordem da lista (as que têm modelo novo sem família vêm no fim). */
export function familiesIn(category: Category): Family[] {
  const orphans = MODELS.filter((m) => m.category === category && !byModel.has(m.id)).map((m) => familyOf(m.id));
  return [...FAMILIES.filter((f) => f.category === category), ...orphans];
}

const CARRY = new Set(["text", "color", "font"]);

/**
 * Ao trocar de variação na família: os campos de texto, cor e fonte com o mesmo nome e o mesmo tipo vão junto
 * (o nome digitado, as cores); o resto fica como a variação de destino já estava.
 */
export function carryFields(from: ModelDef, fromParams: Params, to: ModelDef, toParams: Params): Params {
  const kinds = new Map(from.sections.flatMap((s) => s.fields).map((f) => [f.k, f.kind]));
  const carried = to.sections
    .flatMap((s) => s.fields)
    .filter((f) => CARRY.has(f.kind) && kinds.get(f.k) === f.kind && fromParams[f.k] !== undefined)
    .map((f) => [f.k, fromParams[f.k]] as const);
  return { ...toParams, ...Object.fromEntries(carried) };
}
