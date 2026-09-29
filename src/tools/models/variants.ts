import type { Params } from "./fields";

/** Coleções por ocasião (#24). Um modelo pode estar em várias; variações também marcam coleções. */
export const COLLECTIONS = [
  ["maes", "Dia das Mães"],
  ["natal", "Natal"],
  ["pascoa", "Páscoa"],
  ["aniversario", "Aniversário"],
  ["formatura", "Formatura"],
  ["casamento", "Casamento"],
  ["cha", "Chá de bebê"],
  ["profissoes", "Profissões"],
  ["negocio", "Negócio"],
  ["pets", "Pets"],
] as const;
export type Collection = (typeof COLLECTIONS)[number][0];

/** Variação pronta: muda textos, cores ou tamanho do modelo. Sem personagens, marcas ou temas licenciados. */
export type Variant = { label: string; patch: Params; collections?: Collection[] };

/** Coleções do modelo inteiro (além das que vêm das variações). */
export const MODEL_COLLECTIONS: Record<string, Collection[]> = {
  pix: ["negocio"],
  qrPlate: ["negocio"],
  qrList: ["negocio"],
  businessCard: ["negocio", "profissoes"],
  profession: ["profissoes"],
  sign: ["negocio"],
  nfcTotem: ["negocio"],
  petTag: ["pets"],
  cake: ["aniversario", "casamento", "cha", "formatura"],
  spinner: ["aniversario"],
  logoKeychain: ["aniversario", "negocio"],
  pencilTopper: ["aniversario"],
  snowflake: ["natal"],
  stamp: ["pascoa", "natal"],
  cutterStamp: ["pascoa", "natal"],
  ejector: ["pascoa"],
  adaptiveMedal: ["formatura"],
  trophyElegant: ["formatura", "profissoes"],
  lamp: ["casamento", "maes"],
  wordDecor: ["casamento", "maes"],
  nfcJewelry: ["maes", "casamento"],
  gridCutter: ["pascoa", "natal"],
  stickStand: ["aniversario", "pascoa"],
  cakeStand: ["aniversario", "casamento", "cha"],
  outlineBowl: ["pascoa", "aniversario"],
  stampMold: ["negocio", "maes"],
  screwCase: ["maes", "aniversario"],
};

const PINK = "#f472b6", GOLD = "#f5c542", WHITE = "#f8f8f6", BLACK = "#1c1c1e", RED = "#d6262e", GREEN = "#22a04b", BLUE = "#2563eb", LILAC = "#7e3fd6", SKY = "#7cc4f5";

export const VARIANTS: Record<string, Variant[]> = {
  cake: [
    { label: "15 anos", patch: { line1: "Ana", line2: "15 anos", baseColor: GOLD, textColor: WHITE }, collections: ["aniversario"] },
    { label: "Casamento", patch: { line1: "Ana & Leo", line2: "12.12.2026", baseColor: WHITE, textColor: GOLD }, collections: ["casamento"] },
    { label: "Chá de bebê", patch: { line1: "Bem-vindo", line2: "Theo", baseColor: SKY, textColor: WHITE }, collections: ["cha"] },
    { label: "Formatura", patch: { line1: "Formada!", line2: "Turma 2026", baseColor: BLACK, textColor: GOLD }, collections: ["formatura"] },
    { label: "Dia das Mães", patch: { line1: "Mãe", line2: "te amo", baseColor: PINK, textColor: WHITE }, collections: ["maes"] },
  ],
  bookmark: [
    { label: "Mãe", patch: { text: "Mãe, te amo", baseColor: PINK, textColor: WHITE }, collections: ["maes"] },
    { label: "Professora", patch: { text: "Obrigada, prô!", baseColor: GREEN, textColor: WHITE }, collections: ["profissoes"] },
    { label: "Leitura", patch: { text: "Só mais um capítulo", baseColor: BLACK, textColor: GOLD } },
  ],
  pen: [
    { label: "Professora", patch: { text: "Prô Ana", bodyColor: GREEN, textColor: WHITE }, collections: ["profissoes"] },
    { label: "Escritório", patch: { text: "Equipe", bodyColor: BLACK, textColor: WHITE }, collections: ["negocio"] },
    { label: "Mãe", patch: { text: "Mãe", bodyColor: PINK, textColor: WHITE }, collections: ["maes"] },
  ],
  spinner: [
    { label: "Mãe", patch: { text: "Mãe", frameColor: PINK, diskColor: WHITE, textColor: PINK }, collections: ["maes"] },
    { label: "Pai", patch: { text: "Pai", frameColor: BLACK, diskColor: BLUE, textColor: WHITE } },
    { label: "Natal", patch: { text: "Noel", frameColor: RED, diskColor: GREEN, textColor: WHITE }, collections: ["natal"] },
  ],
  nfc: [
    { label: "Instagram da loja", patch: { text: "Siga!", baseColor: BLACK, textColor: WHITE }, collections: ["negocio"] },
    { label: "Pet", patch: { text: "Thor", baseColor: BLUE, textColor: WHITE }, collections: ["pets"] },
  ],
  trophy: [
    { label: "1º lugar", patch: { text: "1º LUGAR", shape: "star", plateColor: GOLD }, collections: ["formatura"] },
    { label: "Melhor mãe", patch: { text: "MELHOR MÃE", shape: "circle", plateColor: PINK, accentColor: WHITE }, collections: ["maes"] },
    { label: "Funcionário do mês", patch: { text: "DESTAQUE", baseText: "Funcionário do mês", shape: "shield", plateColor: GOLD }, collections: ["negocio", "profissoes"] },
  ],
  stamp: [
    { label: "Com amor", patch: { text: "Com amor", shape: "circle" }, collections: ["casamento", "maes"] },
    { label: "Inicial", patch: { text: "A", shape: "square" } },
    { label: "Obrigado", patch: { text: "Obrigado", shape: "circle" }, collections: ["negocio"] },
  ],
  qrPlate: [
    { label: "Wi-Fi", patch: { kind: "wifi", title: "Wi-Fi", subtitle: "Aponte a câmera" } },
    { label: "Instagram", patch: { kind: "instagram", value: "@minhaloja", title: "Siga a gente", subtitle: "@minhaloja" } },
    { label: "WhatsApp", patch: { kind: "whatsapp", value: "(21) 99999-0000", title: "Peça pelo WhatsApp", subtitle: "" } },
    { label: "Avaliação", patch: { kind: "review", value: "g.page/r/sualoja/review", title: "Avalie a gente", subtitle: "Leva 1 minuto" } },
  ],
  petTag: [
    { label: "Osso", patch: { shape: "bone", baseColor: BLUE } },
    { label: "Patinha", patch: { shape: "paw", baseColor: PINK, name: "Mel" } },
    { label: "Coração", patch: { shape: "heart", baseColor: RED, name: "Luna" } },
  ],
  snowflake: [
    { label: "Azul", patch: { seed: 7, flakeColor: SKY } },
    { label: "Dourado", patch: { seed: 21, flakeColor: GOLD, nameColor: WHITE } },
    { label: "Branco", patch: { seed: 42, flakeColor: WHITE, nameColor: RED } },
  ],
  wordDecor: [
    { label: "AMOR + Família", patch: { base: "AMOR", word: "Família" }, collections: ["casamento", "maes"] },
    { label: "MÃE + Te amo", patch: { base: "MÃE", word: "Te amo", baseColor: WHITE, wordColor: PINK }, collections: ["maes"] },
    { label: "LAR + Doce lar", patch: { base: "LAR", word: "Doce lar" } },
  ],
  mirror: [
    { label: "Mãe", patch: { top: "MÃE", bottom: "LINDA POR DENTRO E POR FORA", bodyColor: PINK }, collections: ["maes"] },
    { label: "Madrinha", patch: { top: "MADRINHA", bottom: "OBRIGADA POR TUDO", bodyColor: LILAC }, collections: ["casamento"] },
  ],
  nfcJewelry: [
    { label: "Mãe", patch: { text: "Mãe", text2: "te amo", bodyColor: PINK, textColor: WHITE }, collections: ["maes"] },
    { label: "Casamento", patch: { text: "Ana & Leo", text2: "2026", bodyColor: WHITE, textColor: GOLD }, collections: ["casamento"] },
  ],
  trophyElegant: [
    { label: "Formatura", patch: { baseText: "FORMATURA 2026", baseText2: "Turma de Direito" }, collections: ["formatura"] },
    { label: "Campeonato", patch: { baseText: "CAMPEONATO 2026", baseText2: "1º LUGAR" } },
  ],
  lamp: [
    { label: "LOVE", patch: { text: "LOVE" }, collections: ["casamento"] },
    { label: "MÃE", patch: { text: "MÃE" }, collections: ["maes"] },
    { label: "Nome do bebê", patch: { text: "THEO" }, collections: ["cha"] },
  ],
  businessCard: [
    { label: "Escuro e dourado", patch: { cardColor: BLACK, textColor: GOLD } },
    { label: "Claro", patch: { cardColor: WHITE, textColor: BLACK } },
  ],
  gymKeychain: [
    { label: "20 KG", patch: { text: "20 KG", plateColor: BLACK, artColor: RED } },
    { label: "Personal", patch: { text: "PERSONAL", plateColor: BLACK, artColor: GOLD }, collections: ["profissoes"] },
  ],
};

/** Modelos de uma coleção: marcados diretamente ou com alguma variação nela. */
export function inCollection(id: string, c: Collection): boolean {
  return (MODEL_COLLECTIONS[id] ?? []).includes(c) || (VARIANTS[id] ?? []).some((v) => v.collections?.includes(c));
}
