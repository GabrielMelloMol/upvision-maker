/** Passo a passo da termoformagem, com o jeito de aquecer (soprador ou água quente). Os números vêm de fontes de fora e são aproximados. */
export type HeatMode = "air" | "water";
export type StepKind = "box" | "vessel" | "band";

export const HEAT_MODES = [["air", "Soprador"], ["water", "Água quente"]] as const;

export const STEP_SOURCES: readonly { label: string; url: string }[] = [
  { label: "Hackaday: malha plástica curva (imprime plano, curva depois)", url: "https://hackaday.com/2026/01/30/need-a-curved-plastic-mesh-print-flat-curve-later/" },
  { label: "MakerWorld: coleção de termoformados", url: "https://makerworld.com/en/collections/19782050-thermoform" },
  { label: "Inov3D: guia de termoformagem", url: "https://www.inov3d.net/thermoform" },
];

export const STEPS_NOTE =
  "Temperaturas e tempos são de referência, tirados de guias de outros makers e do comportamento geral do material (o PLA amolece perto de 55 a 65 °C; o PETG do molde aguenta uns 75 a 80 °C). Teste primeiro numa peça de sobra. Não aqueça o molde.";

const heat = (mode: HeatMode, what: string): string =>
  mode === "air"
    ? `Aqueça ${what} com soprador de ar quente (ou secador forte) a uns 15 a 20 cm, em movimentos circulares, por 20 a 40 segundos, sem parar num ponto só, até ficar mole e flexível. Não encoste o soprador e não derreta: o objetivo é amolecer.`
    : `Aqueça água a 70 a 80 °C (sem ferver) numa panela funda ou numa travessa e mergulhe ${what} por 20 a 40 segundos, até ficar mole e flexível. Pegue com pinça ou luva, tire o excesso de água num pano e trabalhe rápido: ela esfria em segundos.`;

const SANDWICH =
  "Monte o sanduíche, de baixo para cima (veja a figura): 1 o molde fêmea, com a cavidade para cima; 2 a tela plana de PLA, que é a única peça que esquenta; 3 o molde macho, virado com o domo para baixo, que desce e prensa a tela dentro da fêmea.";

export function thermoSteps(kind: StepKind, mode: HeatMode, o: { closure?: "clip" | "ring" | "cap" | "none"; bases?: boolean; pair?: boolean } = {}): string[] {
  if (kind === "vessel" && o.pair)
    return [
      `${SANDWICH} Imprima os dois moldes em PETG (o PLA quente não gruda nele) e o disco em PLA, deitado.`,
      "Apoie a fêmea numa superfície que aguente calor, com a cavidade para cima. Os moldes ficam frios: só o disco esquenta.",
      heat(mode, "o disco"),
      "Com luva, centralize o disco quente sobre a fêmea, desça o macho por cima, no meio, e prense de uma vez até os dois moldes se encostarem. A folga entre eles é a espessura do disco mais um pouco.",
      "Segure uns 20 segundos e, se quiser acelerar, passe um pano molhado em água fria por fora. Deixe esfriar até endurecer, levante o macho e tire a peça.",
      "Apare a borda se precisar e confira se a peça fica em pé sozinha.",
    ];
  if (kind === "vessel")
    return [
      "Imprima o molde em PETG (o PLA quente não gruda nele) e o disco em PLA, deitado.",
      "Apoie o molde, com a boca para cima (macho) ou para baixo (fêmea), numa superfície que aguente calor.",
      heat(mode, "o disco"),
      "Com luva, centralize o disco sobre o molde e empurre pelo meio até a borda do disco baixar e abraçar a parede. Para a fêmea, empurre o centro para dentro da cavidade e alise a parede com a palma da mão.",
      "Segure por uns 20 segundos e, se quiser acelerar, passe um pano molhado em água fria por fora. Deixe esfriar até endurecer e solte.",
      "Apare a borda se precisar e confira se a peça fica em pé sozinha.",
    ];
  if (kind === "band")
    return [
      "Imprima o mandril em PETG, em pé, e a tira em PLA, deitada.",
      heat(mode, "a tira inteira"),
      "Com luva, encoste uma ponta da tira no mandril e enrole até a outra ponta, apertando bem. Se a pulseira for aberta (C), deixe a abertura do lado das marcas.",
      "Segure uns 20 a 30 segundos e esfrie com água fria (um pano molhado ou a torneira) antes de soltar.",
      "Tire do mandril girando de leve. Ela ainda abre um pouco para entrar no pulso; se ficar justa demais, reaqueça e abra com o dedo.",
    ];
  const closing =
    o.closure === "cap" ? "Cole as duas bases pelo lado liso (as metades do pino formam o pino inteiro) e enrosque a tampa: ela é o pendurador, e a fita passa pelo furo."
    : o.closure === "ring" ? "Cole a faixa por fora da emenda das duas metades."
    : o.closure === "clip" ? "Passe as pontas do clipe pelos furos das duas orelhas: ele funciona como dobradiça."
    : "Cole as duas metades pela borda.";
  return [
    `${SANDWICH} Imprima os moldes em PETG (o PLA quente não gruda nele) e as telas, as bases e o fecho em PLA.`,
    "Apoie a fêmea numa superfície que aguente calor, com a cavidade para cima. Os moldes ficam frios: só a tela esquenta.",
    heat(mode, "uma tela"),
    "Com luva, ponha a tela quente sobre a fêmea (a orelha no lugar certo), encaixe o macho por cima, de cabeça para baixo (a parede baixa dele cerca e centraliza a tela), e prense de uma vez até os dois moldes se encostarem. Segure uns 15 segundos.",
    "Deixe esfriar uns 30 segundos, levante o macho e solte a tela: ela mantém a forma de casca. Repita com a outra tela.",
    o.bases ? "Cole cada casca na sua base com cola instantânea em gel só na borda sólida." : "Confira se as duas cascas se encontram sem fresta.",
    closing,
  ];
}
