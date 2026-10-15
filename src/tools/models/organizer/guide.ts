import type { GuideDef, Params, Preset } from "../fields";
import { DEFAULT_ORGANIZER } from "../../../geometry/models/organizer/params";

/** Cada sugestão por uso define todos os campos que importam (o resto fica no padrão da caixa). */
const preset = (id: string, label: string, blurb: string, patch: Params): Preset => ({ id, label, blurb, patch: { ...DEFAULT_ORGANIZER, ...patch } });

export const ORGANIZER_PRESETS: Preset[] = [
  preset("hardware", "Ferragens", "Nichos grandes e pequenos misturados: parafusos, buchas, porcas e arruelas.", { outerW: 180, outerD: 120, outerH: 40, layoutMode: "mixed", cols: 5, rows: 4, text: "Ferragens" }),
  preset("longScrews", "Parafusos longos", "Um canal inteiro na frente para os parafusos longos e uma grade de nichos atrás para as porcas.", { outerW: 200, outerD: 120, outerH: 40, layoutMode: "channel", cols: 4, rows: 3, text: "Parafusos" }),
  preset("screws", "Parafusos 5×4", "Vinte nichos iguais para separar parafusos por medida.", { outerW: 180, outerD: 120, outerH: 40, layoutMode: "equal", cols: 5, rows: 4, text: "Parafusos" }),
  preset("small", "Pequena 3×2", "Caixa de bolso com 6 nichos, cabe em qualquer gaveta.", { outerW: 100, outerD: 70, outerH: 30, layoutMode: "equal", cols: 3, rows: 2, text: "Pequenos" }),
  preset("components", "Componentes 8×5", "Quarenta nichos rasos com parede fina e cantos suaves: resistores, LEDs, botões.", { outerW: 200, outerD: 130, outerH: 25, layoutMode: "equal", cols: 8, rows: 5, divider: 1.2, cellRadius: 2, text: "Componentes", textSize: 10 }),
  preset("deep", "Funda 4×3", "Nichos fundos para peças altas ou muitas de cada vez.", { outerW: 160, outerD: 120, outerH: 70, layoutMode: "equal", cols: 4, rows: 3, text: "Peças" }),
  preset("tray", "Bandeja sem tampa", "Bancada: pega e larga a peça sem abrir nada.", { outerW: 180, outerD: 120, outerH: 30, layoutMode: "equal", cols: 4, rows: 3, lid: "none", labelPlace: "sideLong", text: "Bancada", textSize: 10 }),
  preset("jewelry", "Bijuteria 6×4", "Nichos redondos e macios para brincos, anéis e pingentes, com o nome na tampa.", { outerW: 150, outerD: 100, outerH: 25, layoutMode: "equal", cols: 6, rows: 4, cellRadius: 4, text: "Bijuterias", boxColor: "#f472b6", lidColor: "#f472b6" }),
  preset("sewing", "Linhas e agulhas", "Uma faixa larga para os carretéis e duas de seis nichos para agulhas e botões.", { outerW: 200, outerD: 140, outerH: 50, layoutMode: "custom", strips: "1:1.6, 6:1, 6:1", text: "Costura" }),
];

export const ORGANIZER_GUIDE: GuideDef = {
  presetsLabel: "Comece pelo uso",
  presets: ORGANIZER_PRESETS,
  help: {
    use: [
      "Separar parafusos, porcas, componentes eletrônicos, bijuterias, botões, agulhas ou qualquer coisa pequena que vive solta numa gaveta.",
      "Quando você quer a tampa presa na caixa (dobradiça) e que feche com um clique, sem fita nem elástico.",
      "Para vender: o nome fica na tampa ou na lateral, em 2 cores, e o 3MF já sai com cada peça de uma cor.",
    ],
    avoid: [
      "Peças que não cabem em 9 mm: o menor nicho precisa de pelo menos 9 mm para os dedos pegarem a peça.",
      "Caixas maiores que a mesa da sua impressora: o app avisa, e aí vale reduzir ou usar a bandeja em mais de uma peça.",
      "Armazenar algo pesado em cima de uma caixa de tampa de encaixe: a tampa de dobradiça aguenta mais.",
    ],
    tips: [
      "PETG é o melhor para a dobradiça e a trava: dobra sem quebrar. PLA serve, mas a lingueta fica mais dura (a folga da trava muda sozinha com o material).",
      "Use 3 a 4 perímetros e 25 a 40% de preenchimento. Não precisa de suporte.",
      "Imprima a tampa com o lado de baixo na mesa e os pinos deitados. Se a caixa for pequena, use brim para não descolar.",
      "Se a tampa ficar dura no pino, não force: lixe de leve o furo ou aumente a folga da trava em 0,05 mm.",
    ],
    faq: [
      { q: "Como encaixo o pino da dobradiça?", a: "Com a tampa sobre a caixa, empurre cada pino pelo lado do furo com rebaixo até a cabeça ficar rente. O outro lado do furo é fechado, então o pino não sai pelo lado errado. Uma gota de cola na cabeça fixa de vez." },
      { q: "A trava ficou muito dura ou muito frouxa. O que faço?", a: "A folga da trava sobe de 0,05 em 0,05: dura demais, aumente; solta demais, diminua. PLA pede menos folga que PETG, e Nylon e ABS mais." },
      { q: "Posso misturar nichos de tamanhos diferentes?", a: "Sim: escolha Largos + pequenos, Canal para peças longas ou Faixa por faixa. No mapa você vê cada nicho e a medida dele." },
      { q: "Dá para imprimir sem suporte?", a: "Sim. As partes que ficam no ar (a aleta do batente e o dente da trava) foram feitas em ângulo para imprimir sem suporte." },
      { q: "Para que serve o puxador?", a: "É uma peça separada para colar no meio da frente da tampa e facilitar abrir quando a caixa está cheia." },
      { q: "A caixa não cabe na mesa da minha impressora.", a: "Diminua a largura ou a profundidade, ou escolha a bandeja sem tampa. O aviso da mesa mostra quanto passa." },
    ],
  },
};
