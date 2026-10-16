/**
 * Kit de testes físicos (#247): as peças pequenas de conferência de tudo que depende de medida ou folga sem teste real.
 * Cada cupom é uma varredura numerada em volta do padrão da ferramenta; a pessoa imprime uma vez, experimenta e lança o número
 * escolhido, que vira a folga padrão (Ajustes › Kit de testes). Este arquivo só tem texto e números: a tela e o PDF usam o mesmo.
 */
export type FitKey = "cupClearance" | "boardClearance" | "phoneClearance" | "threadClearance" | "candyClearance" | "gearBacklash" | "hingeClearance" | "latchReach" | "clipHole";

/** Filamento do teste: a capa precisa de TPU, a trava de PETG; o resto serve em PLA ou PETG. Cada grupo sai em mesas próprias. */
export type MaterialGroup = "general" | "petg" | "tpu";
export const GROUP_LABEL: Record<MaterialGroup, string> = { general: "PLA ou PETG", petg: "PETG", tpu: "TPU 95A" };

export type CouponId = "cup" | "board" | "phone" | "thread" | "candy" | "gear" | "hinge" | "latch" | "clip";

export type Coupon = {
  id: CouponId;
  title: string;
  /** Ferramenta (e issue) que usa o valor. */
  tool: string;
  fitKey: FitKey;
  /** O que o número mede e como aparece no app. */
  fitLabel: string;
  unit: "mm";
  /** Valores da varredura: a peça nº 1 é o primeiro. */
  sweep: number[];
  /** O padrão que a ferramenta usa hoje (o que vale sem teste). */
  fallback: number;
  /** Medidas suas que a peça precisa (campos do kit). */
  needs: string[];
  what: string;
  how: string;
  pass: string;
  /** Material em que o teste vale. */
  material: string;
  group: MaterialGroup;
  /** Ferramenta que já usa o valor lançado (as outras só passam a usar quando entrarem no app). */
  appliedIn?: string;
};

export const COUPONS: Coupon[] = [
  {
    id: "cup",
    title: "Anel do copo",
    tool: "Alça de copo térmico (#221)",
    fitKey: "cupClearance",
    fitLabel: "Folga do copo",
    unit: "mm",
    sweep: [0.2, 0.35, 0.5, 0.65, 0.8],
    fallback: 0.5,
    needs: ["Diâmetro do copo na altura da alça (meça com paquímetro)"],
    what: "Cinco anéis curtos com folgas diferentes em volta do diâmetro do seu copo.",
    how: "Passe cada anel pelo copo, de baixo para cima, até a altura onde a alça vai ficar.",
    pass: "Vale o anel de menor número que desliza só com a mão e não balança.",
    material: "PLA ou PETG",
    group: "general",
  },
  {
    id: "board",
    title: "Moldura da placa",
    tool: "Caixa de placa eletrônica (#233)",
    fitKey: "boardClearance",
    fitLabel: "Folga da placa na caixa",
    unit: "mm",
    sweep: [0.2, 0.35, 0.5, 0.65, 0.8],
    fallback: 0.5,
    needs: ["Comprimento e largura da placa"],
    what: "Cinco molduras do tamanho da sua placa mais a folga: a bandeja onde ela fica na caixa.",
    how: "Encaixe a placa de verdade em cada moldura, pressionando de leve.",
    pass: "Vale a moldura onde ela entra sem forçar e sem folga visível nas bordas.",
    material: "PLA ou PETG",
    group: "general",
  },
  {
    id: "phone",
    title: "Canto da capa",
    tool: "Capa de celular (#232)",
    fitKey: "phoneClearance",
    fitLabel: "Folga da capa no aparelho",
    unit: "mm",
    sweep: [0, 0.1, 0.15, 0.2, 0.3],
    fallback: 0.15,
    needs: ["Largura, espessura e raio do canto do aparelho"],
    what: "Cinco cantos de capa com folgas diferentes: só o trecho do canto de baixo.",
    how: "Encaixe o canto de baixo do aparelho em cada peça.",
    pass: "Vale a que abraça o canto firme, sem esforço para entrar nem sair.",
    material: "TPU 95A (em PLA o teste engana: não dobra)",
    group: "tpu",
  },
  {
    id: "thread",
    title: "Rosca do estojo e do aromatizador",
    tool: "Estojo com rosca e Chaveiro aromatizador (#219)",
    fitKey: "threadClearance",
    fitLabel: "Folga da rosca",
    unit: "mm",
    sweep: [0.2, 0.3, 0.35, 0.4, 0.5],
    fallback: 0.35,
    needs: [],
    what: "Cinco potinhos pequenos com tampa de rosca, cada um com uma folga.",
    how: "Rosqueie e desrosqueie cada tampa com a mão.",
    pass: "Vale a que gira macia, fecha sem balançar e não solta sozinha ao sacudir.",
    material: "PLA ou PETG",
    group: "general",
    appliedIn: "Estojo com tampa de rosca",
  },
  {
    id: "candy",
    title: "Êmbolo do docinho",
    tool: "Forma de docinho com ejetor (#220)",
    fitKey: "candyClearance",
    fitLabel: "Folga do ejetor",
    unit: "mm",
    sweep: [0.2, 0.3, 0.4, 0.5, 0.6],
    fallback: 0.4,
    needs: ["Diâmetro do êmbolo (o tamanho típico da sua forma)"],
    what: "Cinco pares de tubo e êmbolo com folgas diferentes.",
    how: "Empurre cada êmbolo dentro do tubo e solte.",
    pass: "Vale o par em que o êmbolo desliza sem prender e sem sobrar balanço.",
    material: "PLA ou PETG",
    group: "general",
  },
  {
    id: "gear",
    title: "Par de engrenagens",
    tool: "Peças mecânicas (#230)",
    fitKey: "gearBacklash",
    fitLabel: "Folga entre os dentes",
    unit: "mm",
    sweep: [0.1, 0.2, 0.3, 0.4],
    fallback: 0.2,
    needs: [],
    what: "Quatro pares de engrenagens soltas e uma base com os dois pinos na distância certa.",
    how: "Ponha as duas engrenagens nos pinos e gire uma pela outra.",
    pass: "Vale o par que gira macio, sem prender nem estalar, com o mínimo de jogo.",
    material: "PLA ou PETG",
    group: "general",
  },
  {
    id: "hinge",
    title: "Dobradiça impressa montada",
    tool: "Caixa organizadora (#204)",
    fitKey: "hingeClearance",
    fitLabel: "Folga do pino da dobradiça",
    unit: "mm",
    sweep: [0.2, 0.3, 0.4],
    fallback: 0.3,
    needs: [],
    what: "Três dobradiças de pino já montadas, com folgas diferentes no furo do pino.",
    how: "Depois de esfriar, dobre cada dobradiça para soltar e abra e feche 20 vezes.",
    pass: "Vale a de menor número que solta fácil e gira sem arrastar nem balançar.",
    material: "PLA ou PETG",
    group: "general",
  },
  {
    id: "latch",
    title: "Trava de encaixe",
    tool: "Caixa organizadora (#204)",
    fitKey: "latchReach",
    fitLabel: "Profundidade do gancho da trava",
    unit: "mm",
    sweep: [0.8, 1.2, 1.6],
    fallback: 1.2,
    needs: [],
    what: "Três pares de lâmina com gancho e batente, com o gancho mais ou menos fundo.",
    how: "Vire a peça A de cabeça para baixo e empurre sobre a B até estalar; puxe para soltar. Repita 20 vezes.",
    pass: "Vale a que estala firme, segura sem folga e solta sem quebrar a lâmina.",
    material: "PETG (em PLA a lâmina pode trincar)",
    group: "petg",
  },
  {
    id: "clip",
    title: "Orelhas e clipe",
    tool: "Caixinha termoformada (clipe)",
    fitKey: "clipHole",
    fitLabel: "Diâmetro do furo da orelha",
    unit: "mm",
    sweep: [3.2, 3.4, 3.6, 3.8, 4],
    fallback: 3.6,
    needs: [],
    what: "Cinco pares de orelhas com furos de tamanhos diferentes e um clipe.",
    how: "Empilhe duas orelhas do mesmo número e passe as pontas do clipe pelos furos.",
    pass: "Vale o furo por onde o clipe passa com um leve aperto e gira sem escapar.",
    material: "PLA ou PETG",
    group: "general",
  },
];

export const couponOf = (id: CouponId): Coupon => COUPONS.find((c) => c.id === id)!;

/** Medidas suas que alguns cupons precisam; o padrão serve para ver o kit sem digitar nada. */
export type KitInputs = {
  cupDiameter: number;
  boardL: number;
  boardW: number;
  phoneW: number;
  phoneT: number;
  phoneR: number;
  candyD: number;
};
export const DEFAULT_INPUTS: KitInputs = { cupDiameter: 75, boardL: 60, boardW: 40, phoneW: 72, phoneT: 8.5, phoneR: 9, candyD: 20 };

export type KitSelection = Record<CouponId, boolean>;
export const ALL_COUPONS: KitSelection = Object.fromEntries(COUPONS.map((c) => [c.id, true])) as KitSelection;

/** Folgas validadas pela pessoa (Ajustes › Kit de testes); sem valor lançado vale o padrão da ferramenta. */
export type Fits = Partial<Record<FitKey, number>>;
export const fitOrDefault = (fits: Fits | undefined, key: FitKey): number => fits?.[key] ?? COUPONS.find((c) => c.fitKey === key)!.fallback;
