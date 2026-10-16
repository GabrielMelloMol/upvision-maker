import type { Params } from "./fields";

/** Coleções por ocasião (#24). Um modelo pode estar em várias; variações também marcam coleções. */
export const COLLECTIONS = [
  ["maes", "Dia das Mães"],
  ["natal", "Natal"],
  ["pascoa", "Páscoa"],
  ["junina", "Festa Junina"],
  ["pais", "Dia dos Pais"],
  ["criancas", "Dia das Crianças"],
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
export type Variant = { label: string; patch: Params; collections?: Collection[]; /** Frase de ajuda: o que o clique faz (padrão: preenche o exemplo). */ blurb?: string };

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
  starMap: ["aniversario", "casamento", "maes", "pais"],
  ornamentSpinner: ["natal"],
  stamp: ["pascoa", "natal"],
  cutterStamp: ["pascoa", "natal"],
  ejector: ["pascoa"],
  candyMold: ["pascoa", "aniversario", "maes"],
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
  textureRoller: ["natal", "pascoa"],
  goalBoard: ["negocio", "casamento"],
  rpgDice: ["criancas", "aniversario"],
};

const PINK = "#f472b6", GOLD = "#f5c542", WHITE = "#f8f8f6", BLACK = "#1c1c1e", RED = "#d6262e", GREEN = "#22a04b", BLUE = "#2563eb", LILAC = "#7e3fd6", SKY = "#7cc4f5";

export const VARIANTS: Record<string, Variant[]> = {
  aroma: [
    { label: "Carro (logo de empresa)", patch: { shape: "round", text: "Sua marca", holes: 10, logoSize: 40, bodyColor: BLACK, lidColor: WHITE, logoColor: RED }, collections: ["negocio"] },
    { label: "Lembrancinha de festa (nome)", patch: { shape: "hex", text: "Ana", holes: 8, bodyColor: LILAC, lidColor: WHITE, logoColor: PINK }, collections: ["aniversario"] },
    { label: "Dia das Mães (coração)", patch: { shape: "heart", text: "Mãe", holes: 8, bodyColor: PINK, lidColor: WHITE, logoColor: RED }, collections: ["maes"] },
  ],
  cupHandle: [
    { label: "Stanley Quencher 40 oz (aprox.)", patch: { baseDiameter: 80, topDiameter: 100, bodyHeight: 260, gripZ: 70, sleeveHeight: 40 } },
    { label: "Stanley Quencher 30 oz (aprox.)", patch: { baseDiameter: 80, topDiameter: 91, bodyHeight: 215, gripZ: 60, sleeveHeight: 40 } },
    { label: "Copo 1,2 L tipo Stanley (aprox.)", patch: { baseDiameter: 85, topDiameter: 105, bodyHeight: 270, gripZ: 80, sleeveHeight: 40 } },
    { label: "Copo 900 ml tipo Stanley (aprox.)", patch: { baseDiameter: 78, topDiameter: 95, bodyHeight: 235, gripZ: 70, sleeveHeight: 40 } },
    { label: "Copo 500 ml cônico (aprox.)", patch: { baseDiameter: 62, topDiameter: 78, bodyHeight: 165, gripZ: 45, sleeveHeight: 35 } },
  ],
  candyMold: [
    { label: "Brigadeiro 18 g", patch: { weight: 18, density: 1.2, shape: "round", depth: 14 }, collections: ["aniversario"] },
    { label: "Docinho de festa 25 g", patch: { weight: 25, density: 1.2, shape: "heart", depth: 14 }, collections: ["aniversario", "casamento"] },
    { label: "Trufa 30 g", patch: { weight: 30, density: 1.3, shape: "round", depth: 20 }, collections: ["pascoa"] },
    { label: "Barrinha 40 g", patch: { weight: 40, density: 1.2, shape: "bar", depth: 12 } },
    { label: "Coração do Dia das Mães 25 g", patch: { weight: 25, density: 1.2, shape: "heart", depth: 14, stampText: "Mãe" }, collections: ["maes"] },
  ],
  drainCover: [
    { label: "Ralo de pia 50 mm", patch: { drainD: 50, style: "plug", overhang: 8, plugDepth: 12 } },
    { label: "Ralo de pia 90 mm", patch: { drainD: 90, style: "plug", overhang: 10, plugDepth: 15 } },
    { label: "Ralo de chuveiro 100 mm", patch: { drainD: 100, style: "strainer", overhang: 10, holeD: 4, knob: false } },
    { label: "Ralo de tanque 40 mm", patch: { drainD: 40, style: "cover", overhang: 8, knob: true } },
  ],
  funnel: [
    { label: "Garrafa PET (bico 20 mm)", patch: { topD: 90, neckD: 20, coneH: 60, neckLen: 30 } },
    { label: "Óleo de motor", patch: { topD: 110, neckD: 25, coneH: 70, neckLen: 50 } },
    { label: "Frasco pequeno (bico 8 mm)", patch: { topD: 50, neckD: 8, coneH: 40, neckLen: 20, wall: 1.2 } },
    { label: "Tinta e solvente", patch: { topD: 150, neckD: 30, coneH: 90, neckLen: 40, wall: 2 } },
  ],
  oring: [
    { label: "10 × 2 mm", patch: { innerD: 10, cord: 2, quantity: 6 } },
    { label: "20 × 3 mm", patch: { innerD: 20, cord: 3, quantity: 4 } },
    { label: "32 × 3 mm", patch: { innerD: 32, cord: 3, quantity: 4 } },
    { label: "50 × 4 mm", patch: { innerD: 50, cord: 4, quantity: 2 } },
  ],
  seal: [
    { label: "Eixo 12 × 22 × 7", patch: { shaftD: 12, housingD: 22, width: 7 } },
    { label: "Eixo 20 × 35 × 7", patch: { shaftD: 20, housingD: 35, width: 7 } },
    { label: "Eixo 25 × 40 × 7", patch: { shaftD: 25, housingD: 40, width: 7 } },
    { label: "Eixo 30 × 42 × 7", patch: { shaftD: 30, housingD: 42, width: 7 } },
  ],
  boardBox: [
    { label: "Arduino Uno R3 (aprox.)", patch: { boardL: 68.6, boardW: 53.3, boardT: 1.6, holes: "14, 2.5; 15.3, 50.7; 66.1, 7.6; 66.1, 35.5", holeD: 3.2, mount: "pegs", connectors: "left, 38, 13, 12, 0\nleft, 7.5, 10, 12, 0", headroom: 20, label: "Arduino" } },
    { label: "Raspberry Pi 4B (aprox.)", patch: { boardL: 85, boardW: 56, boardT: 1.4, holes: "3.5, 3.5; 61.5, 3.5; 3.5, 52.5; 61.5, 52.5", holeD: 2.7, mount: "pegs", connectors: "right, 10.25, 16.5, 14, 0\nright, 29, 15, 16, 0\nright, 47, 15, 16, 0\nbottom, 11.2, 9.5, 4, 0\nbottom, 26, 8, 4, 0\nbottom, 39.5, 8, 4, 0\nbottom, 53.5, 7, 7, 0", headroom: 20, label: "Raspberry" } },
    { label: "ESP32 DevKit (aprox.)", patch: { boardL: 51.5, boardW: 28.3, boardT: 1.6, holes: "", holeD: 3, mount: "pads", connectors: "left, 14.2, 9, 4.5, 0", headroom: 14, label: "ESP32" } },
    { label: "Raspberry Pi Pico (aprox.)", patch: { boardL: 51, boardW: 21, boardT: 1.0, holes: "", holeD: 2.1, mount: "pads", connectors: "left, 10.5, 9, 4.5, 0", headroom: 12, label: "Pico" } },
    { label: "Arduino Nano (aprox.)", patch: { boardL: 45, boardW: 18, boardT: 1.6, holes: "", holeD: 2, mount: "pads", connectors: "left, 9, 9, 5, 0", headroom: 12, label: "Nano" } },
  ],
  drillJig: [
    { label: "Prateleira 32 mm (broca 5)", patch: { holes: 4, drillD: 5, pitch: 32, edgeDist: 37 } },
    { label: "Dobradiça (broca 3, 2 furos)", patch: { holes: 2, drillD: 3, pitch: 32, edgeDist: 20 } },
    { label: "Puxador 96 mm (broca 4)", patch: { holes: 2, drillD: 4, pitch: 96, edgeDist: 25 } },
  ],
  radiusGauge: [
    { label: "Quinas pequenas", patch: { radii: "0,5; 1; 1,5; 2; 2,5; 3" } },
    { label: "Quinas e filetes", patch: { radii: "1; 1,5; 2; 3; 4; 5; 6; 8; 10" } },
    { label: "Raios grandes", patch: { radii: "10; 12; 15; 20; 25; 30" } },
  ],
  labelJig: [
    { label: "Etiqueta 50 × 30", patch: { labelW: 50, labelH: 30 } },
    { label: "Etiqueta 100 × 50", patch: { labelW: 100, labelH: 50 } },
    { label: "Etiqueta de rolo 50 × 30", patch: { labelW: 50, labelH: 30, rim: 10 } },
  ],
  phoneCase: [
    { label: "iPhone 15 / 16 (aprox.)", patch: { phoneL: 147.6, phoneW: 71.6, phoneT: 7.8, cornerR: 11, camX: 4.5, camY: 4.5, camW: 34, camH: 34, camR: 9 } },
    { label: "iPhone 15 / 16 Pro (aprox.)", patch: { phoneL: 149.6, phoneW: 71.5, phoneT: 8.3, cornerR: 11, camX: 4, camY: 4, camW: 37, camH: 38, camR: 10 } },
    { label: "iPhone 16 Pro Max (aprox.)", patch: { phoneL: 163, phoneW: 77.6, phoneT: 8.3, cornerR: 11.5, camX: 4.5, camY: 4.5, camW: 38, camH: 38, camR: 10 } },
    { label: "Galaxy S24 (aprox.)", patch: { phoneL: 147, phoneW: 70.6, phoneT: 7.6, cornerR: 10, camX: 8, camY: 6, camW: 16, camH: 46, camR: 8 } },
  ],
  spurGear: [
    { label: "Par 1 : 1 (20 e 20 dentes)", patch: { teeth: 20, teeth2: 20 } },
    { label: "Par 1 : 2 (18 e 36 dentes)", patch: { teeth: 18, teeth2: 36 } },
    { label: "Redução forte 1 : 3 (12 e 36 dentes)", patch: { teeth: 12, teeth2: 36 } },
  ],
  planetary: [
    { label: "Redução 4 : 1", patch: { sun: 12, planet: 12, planets: 3 } },
    { label: "Redução 5 : 1", patch: { sun: 12, planet: 18, planets: 3 } },
  ],
  pulley: [
    { label: "GT2 de 16 dentes", patch: { pitch: "2", teeth: 16 } },
    { label: "GT2 de 20 dentes", patch: { pitch: "2", teeth: 20 } },
    { label: "HTD 3M de 24 dentes", patch: { pitch: "3", teeth: 24, width: 10 } },
  ],
  sprocket: [
    { label: "ANSI 25 (12 dentes)", patch: { preset: "ansi25", teeth: 12 } },
    { label: "ANSI 35 (16 dentes)", patch: { preset: "ansi35", teeth: 16 } },
    { label: "08B (14 dentes)", patch: { preset: "08b", teeth: 14 } },
  ],
  chain: [
    { label: "Pulseira (10 elos pequenos)", patch: { links: 10, pitch: 14, width: 8, thickness: 3 } },
    { label: "Corrente grossa (6 elos)", patch: { links: 6, pitch: 24, width: 14, thickness: 5 } },
  ],
  kitBicho: [
    { label: "Cachorro", patch: { head: "dog", tail: "up", profile: "oval" } },
    { label: "Gato", patch: { head: "cat", tail: "long", profile: "oval" } },
    { label: "Saurópode", patch: { head: "sauro", tail: "thick", profile: "oval" } },
    { label: "T-rex", patch: { head: "trex", tail: "thick", profile: "boxy" } },
  ],
  kitBau: [
    { label: "Pequeno", patch: { width: 44, depth: 30, height: 22 } },
    { label: "Médio", patch: { width: 56, depth: 38, height: 26 } },
    { label: "Grande", patch: { width: 64, depth: 42, height: 28 } },
  ],
  cake: [
    { label: "15 anos", patch: { line1: "Ana", line2: "15 anos", baseColor: GOLD, textColor: WHITE }, collections: ["aniversario"] },
    { label: "Casamento", patch: { line1: "Ana & Leo", line2: "12.12.2026", baseColor: WHITE, textColor: GOLD }, collections: ["casamento"] },
    { label: "Chá de bebê", patch: { line1: "Bem-vindo", line2: "Theo", baseColor: SKY, textColor: WHITE }, collections: ["cha"] },
    { label: "Formatura", patch: { line1: "Formada!", line2: "Turma 2026", baseColor: BLACK, textColor: GOLD }, collections: ["formatura"] },
    { label: "Dia das Mães", patch: { line1: "Mãe", line2: "te amo", baseColor: PINK, textColor: WHITE }, collections: ["maes"] },
    { label: "Dia dos Pais", patch: { line1: "Pai", line2: "meu herói", baseColor: BLUE, textColor: WHITE }, collections: ["pais"] },
    { label: "Dia das Crianças", patch: { line1: "Feliz", line2: "Dia das Crianças", baseColor: SKY, textColor: WHITE }, collections: ["criancas"] },
    { label: "Arraiá", patch: { line1: "Arraiá", line2: "do Théo", baseColor: RED, textColor: GOLD }, collections: ["junina"] },
  ],
  layeredSign: [
    {
      label: "Nascimento",
      patch: { line1: "Theo", line2: "12.03.2026", line3: "às 14h32", line4: "3,2 kg - 49 cm", h1: 30, h2: 14, h3: 12, h4: 12, font1: "pacifico", c1: BLUE, c2: BLACK, c3: BLACK, c4: BLACK, ornament: "star", ornamentColor: GOLD, border: 5, baseColor: WHITE, frame: true, frameColor: GOLD },
      collections: ["cha"],
    },
    {
      label: "Casamento",
      patch: { line1: "Ana & Leo", line2: "12.12.2026", line3: "Rio de Janeiro", line4: "", h1: 28, h2: 16, h3: 12, font1: "pacifico", c1: GOLD, c2: BLACK, c3: BLACK, ornament: "heart", ornamentColor: RED, border: 5, baseColor: WHITE, frame: true, frameColor: GOLD },
      collections: ["casamento"],
    },
    {
      label: "Casa nova",
      patch: { line1: "Casa nova", line2: "Ana e Leo", line3: "2026", line4: "", h1: 28, h2: 18, h3: 12, font1: "pacifico", c1: GREEN, c2: BLACK, c3: BLACK, ornament: "heart", ornamentColor: GREEN, border: 5, baseColor: WHITE, frame: true, frameColor: BLACK },
    },
    {
      label: "Pet (in memoriam)",
      patch: { line1: "Mel", line2: "2012 - 2026", line3: "Sempre no coração", line4: "", h1: 30, h2: 14, h3: 12, font1: "pacifico", c1: LILAC, c2: BLACK, c3: BLACK, ornament: "paw", ornamentColor: LILAC, border: 5, baseColor: WHITE, frame: true, frameColor: LILAC },
      collections: ["pets"],
    },
  ],
  bookmark: [
    { label: "Mãe", patch: { text: "Mãe, te amo", baseColor: PINK, textColor: WHITE }, collections: ["maes"] },
    { label: "Pai", patch: { text: "Pai, te amo", baseColor: BLUE, textColor: WHITE }, collections: ["pais"] },
    { label: "Professora", patch: { text: "Obrigada, prô!", baseColor: GREEN, textColor: WHITE }, collections: ["profissoes"] },
    { label: "Leitura", patch: { text: "Só mais um capítulo", baseColor: BLACK, textColor: GOLD } },
  ],
  pen: [
    { label: "Professora", patch: { text: "Prô Ana", bodyColor: GREEN, textColor: WHITE }, collections: ["profissoes"] },
    { label: "Escritório", patch: { text: "Equipe", bodyColor: BLACK, textColor: WHITE }, collections: ["negocio"] },
    { label: "Mãe", patch: { text: "Mãe", bodyColor: PINK, textColor: WHITE }, collections: ["maes"] },
    { label: "Pai", patch: { text: "Pai", bodyColor: BLUE, textColor: WHITE }, collections: ["pais"] },
  ],
  spinner: [
    { label: "Mãe", patch: { text: "Mãe", frameColor: PINK, diskColor: WHITE, textColor: PINK }, collections: ["maes"] },
    { label: "Pai", patch: { text: "Pai", frameColor: BLACK, diskColor: BLUE, textColor: WHITE }, collections: ["pais"] },
    { label: "Criança", patch: { text: "Léo", frameColor: SKY, diskColor: GOLD, textColor: BLACK }, collections: ["criancas"] },
    { label: "São João", patch: { text: "Arraiá", frameColor: RED, diskColor: GOLD, textColor: BLACK }, collections: ["junina"] },
    { label: "Natal", patch: { text: "Noel", frameColor: RED, diskColor: GREEN, textColor: WHITE }, collections: ["natal"] },
  ],
  ornamentSpinner: [
    { label: "Feliz Natal", patch: { text: "Feliz Natal", trim: "star", frameColor: RED, diskColor: WHITE, artColor: GREEN }, collections: ["natal"] },
    { label: "Sinos", patch: { text: "Boas Festas", trim: "bell", frameColor: GREEN, diskColor: WHITE, artColor: RED }, collections: ["natal"] },
    { label: "Bolinhas", patch: { text: "Noel", trim: "dot", trimCount: 10, frameColor: BLUE, diskColor: WHITE, artColor: BLUE }, collections: ["natal"] },
    { label: "Com nome", patch: { text: "Ana", trim: "star", frameColor: GOLD, diskColor: RED, artColor: WHITE }, collections: ["natal"] },
  ],
  starMap: [
    { label: "Casamento", patch: { title: "O dia em que dissemos sim", plateColor: BLACK, starColor: GOLD }, collections: ["casamento"] },
    { label: "Nascimento", patch: { title: "O dia em que você chegou", plateColor: "#1b3a6b", starColor: WHITE }, collections: ["cha", "maes"] },
    { label: "Aniversário", patch: { title: "A noite em que você nasceu", plateColor: LILAC, starColor: WHITE }, collections: ["aniversario"] },
    { label: "Dia dos Pais", patch: { title: "Pai, nosso céu", plateColor: BLUE, starColor: WHITE }, collections: ["pais"] },
  ],
  nfc: [
    { label: "Instagram da loja", patch: { text: "Siga!", baseColor: BLACK, textColor: WHITE }, collections: ["negocio"] },
    { label: "Pet", patch: { text: "Thor", baseColor: BLUE, textColor: WHITE }, collections: ["pets"] },
  ],
  trophy: [
    { label: "1º lugar", patch: { text: "1º LUGAR", shape: "star", plateColor: GOLD }, collections: ["formatura"] },
    { label: "Melhor mãe", patch: { text: "MELHOR MÃE", shape: "circle", plateColor: PINK, accentColor: WHITE }, collections: ["maes"] },
    { label: "Melhor pai", patch: { text: "MELHOR PAI", shape: "circle", plateColor: BLUE, accentColor: WHITE }, collections: ["pais"] },
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
    { label: "PAI", patch: { text: "PAI" }, collections: ["pais"] },
    { label: "ARRAIÁ", patch: { text: "ARRAIÁ" }, collections: ["junina"] },
    { label: "KIDS", patch: { text: "KIDS" }, collections: ["criancas"] },
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
