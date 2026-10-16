import { Cable, CircleDot, Cog, Disc, Filter, Sprout, Wind, Droplets, Cylinder, Crosshair, RectangleHorizontal, Ruler } from "lucide-react";
import { buildCableComb, DEFAULT_CABLE_COMB } from "../../../geometry/models/cableComb";
import { buildHoseAdapter, DEFAULT_HOSE_ADAPTER } from "../../../geometry/models/hoseAdapter";
import { buildKnob, DEFAULT_KNOB } from "../../../geometry/models/knob";
import { buildPlantMarker, DEFAULT_PLANT_MARKER } from "../../../geometry/models/plantMarker";
import { buildSpacer, DEFAULT_SPACER } from "../../../geometry/models/spacer";
import { buildDrainCover, buildFunnel, buildORing, buildSeal, DEFAULT_DRAIN_COVER, DEFAULT_FUNNEL, DEFAULT_ORING, DEFAULT_SEAL } from "../../../geometry/models/workshop";
import { buildSpoolHolder, DEFAULT_SPOOL_HOLDER } from "../../../geometry/models/spoolHolder";
import { as, bool, choice, color, num, text, type ModelDef } from "../fields";
import { buildDrillJig, buildLabelJig, buildRadiusGauge, DEFAULT_DRILL_JIG, DEFAULT_LABEL_JIG, DEFAULT_RADIUS_GAUGE } from "../../../geometry/models/jigs";

/** Casa, utilitários paramétricos rápidos (#121): arruela, marcador de planta, pente de cabos, botão e adaptador de mangueira. */
export const HOME_UTILITY_MODELS: ModelDef[] = [
  {
    id: "spacer",
    category: "home",
    label: "Espaçador, calço ou arruela",
    blurb: "Anel com o furo, o diâmetro e a espessura que você precisa, em quantas peças quiser.",
    icon: CircleDot,
    defaults: DEFAULT_SPACER,
    sections: [
      {
        title: "Medidas",
        fields: [
          num("innerD", "Furo (diâmetro interno)", 1, 100, { step: 0.5 }),
          num("outerD", "Diâmetro externo", 4, 120, { step: 0.5, hint: "Fica pelo menos 2,4 mm maior que o furo." }),
          num("thickness", "Espessura", 0.4, 30, { step: 0.2 }),
          num("quantity", "Quantidade", 1, 100, { step: 1, unit: "" }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildSpacer(ctx, as(p)),
  },
  {
    id: "plantMarker",
    category: "home",
    label: "Marcador de horta ou planta",
    blurb: "Plaquinha com o nome da planta em relevo, de outra cor, e haste com ponta para espetar na terra.",
    icon: Sprout,
    font: true,
    defaults: DEFAULT_PLANT_MARKER,
    sections: [
      {
        title: "Nome e medidas",
        fields: [
          text("text", "Nome da planta", 20),
          num("headWidth", "Largura da plaquinha", 25, 120, { step: 1 }),
          num("headHeight", "Altura da plaquinha", 15, 60, { step: 1 }),
          num("stakeLength", "Comprimento da haste", 30, 220, { step: 5 }),
          num("stakeWidth", "Largura da haste", 5, 20, { step: 1 }),
          num("thickness", "Espessura", 2, 6, { step: 0.5 }),
          num("relief", "Relevo do nome", 0.4, 2, { step: 0.2 }),
          color("plateColor", "Plaquinha"),
          color("textColor", "Nome"),
        ],
      },
    ],
    build: (ctx, p) => buildPlantMarker(ctx, as(p)),
  },
  {
    id: "cableComb",
    category: "home",
    label: "Clipe e pente de cabos",
    blurb: "Organiza de 1 a 8 cabos lado a lado; eles entram por pressão e ficam presos. Cole ou parafuse pelo fundo.",
    icon: Cable,
    defaults: DEFAULT_CABLE_COMB,
    sections: [
      {
        title: "Cabos e corpo",
        fields: [
          num("cables", "Número de cabos", 1, 8, { step: 1, unit: "" }),
          num("cableD", "Diâmetro do cabo", 2, 15, { step: 0.5 }),
          num("topThickness", "Espessura do tampo", 1, 6, { step: 0.5, hint: "O fundo do pente, por onde cola ou parafusa." }),
          num("length", "Comprimento", 6, 40, { step: 1 }),
          num("wall", "Parede entre os cabos", 1.2, 5, { step: 0.2 }),
          num("clearance", "Folga do cabo", 0, 1, { step: 0.05 }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildCableComb(ctx, as(p)),
  },
  {
    id: "knob",
    category: "home",
    label: "Botão ou manopla",
    blurb: "Botão redondo com furo de eixo redondo ou em D, serrilha e marca de indicação.",
    icon: Cog,
    defaults: DEFAULT_KNOB,
    sections: [
      {
        title: "Botão",
        fields: [
          num("diameter", "Diâmetro", 12, 80, { step: 1 }),
          num("height", "Altura", 6, 50, { step: 1 }),
          num("serrations", "Serrilha (ranhuras)", 0, 40, { step: 1, unit: "", hint: "0 deixa a borda lisa." }),
          num("serrationDepth", "Fundo da ranhura", 0.5, 3, { step: 0.25 }),
          choice("mark", "Marca", [["none", "Sem"], ["line", "Linha"], ["dot", "Ponto"]]),
          color("color", "Cor"),
        ],
      },
      {
        title: "Eixo",
        fields: [
          choice("shaft", "Furo do eixo", [["round", "Redondo"], ["d", "Em D"]]),
          num("shaftD", "Diâmetro do eixo", 2, 20, { step: 0.5 }),
          num("flatDepth", "Chato do eixo em D", 0.2, 3, { step: 0.1 }),
          num("shaftDepth", "Profundidade do furo", 3, 40, { step: 1 }),
          num("clearance", "Folga do furo", 0, 0.6, { step: 0.05, hint: "Somada ao diâmetro do eixo." }),
        ],
      },
    ],
    build: (ctx, p) => buildKnob(ctx, as(p)),
  },
  {
    id: "hoseAdapter",
    category: "home",
    label: "Adaptador de mangueira ou aspirador",
    blurb: "Liga duas bocas de diâmetros diferentes com um cone: diâmetro interno e externo e comprimento de cada lado.",
    icon: Wind,
    defaults: DEFAULT_HOSE_ADAPTER,
    sections: [
      {
        title: "Lado A (mais largo, na mesa)",
        fields: [
          num("innerA", "Diâmetro interno A", 6, 120, { step: 0.5 }),
          num("outerA", "Diâmetro externo A", 8, 130, { step: 0.5 }),
          num("lengthA", "Comprimento A", 8, 80, { step: 1 }),
        ],
      },
      {
        title: "Lado B e cone",
        fields: [
          num("innerB", "Diâmetro interno B", 6, 120, { step: 0.5 }),
          num("outerB", "Diâmetro externo B", 8, 130, { step: 0.5 }),
          num("lengthB", "Comprimento B", 8, 80, { step: 1 }),
          num("cone", "Comprimento do cone", 5, 80, { step: 1, hint: "Quanto mais longo, mais suave; cone muito curto precisa de suporte." }),
          bool("ribs", "Nervuras de retenção nas pontas"),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildHoseAdapter(ctx, as(p)),
  },
  {
    id: "drainCover",
    category: "kitchen",
    label: "Tampa de ralo",
    blurb: "Tampa para pia, tanque ou chuveiro: com pino que entra no ralo, só a aba que cobre, ou com furos para escoar. Você mede o ralo.",
    icon: Droplets,
    defaults: DEFAULT_DRAIN_COVER,
    sections: [
      {
        title: "O ralo",
        fields: [
          num("drainD", "Diâmetro do ralo", 20, 170, { step: 0.5, hint: "Meça a abertura por dentro com paquímetro ou régua. Pia: 40 a 90 mm; chuveiro e tanque: 50 a 100 mm." }),
          choice("style", "Tipo", [["plug", "Com pino"], ["cover", "Só cobre"], ["strainer", "Com furos"]]),
          num("overhang", "Aba para fora do ralo", 3, 30, { step: 1, hint: "Quanto a tampa passa da borda do ralo em cada lado." }),
          num("plugDepth", "Profundidade do pino", 4, 40, { step: 1, hint: "Só no tipo com pino." }),
          num("clearance", "Folga do pino", 0.1, 1, { step: 0.05, hint: "0,4 costuma entrar com leve pressão; ralo de plástico varia, teste." }),
        ],
      },
      {
        title: "Tampa",
        fields: [
          num("thickness", "Espessura da aba", 2, 8, { step: 0.5 }),
          bool("knob", "Botão para puxar"),
          num("holeD", "Furo da água", 2, 8, { step: 0.5, hint: "Só no tipo com furos." }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildDrainCover(ctx, as(p)),
  },
  {
    id: "funnel",
    category: "kitchen",
    label: "Funil",
    blurb: "Boca larga, cone e bico com os diâmetros que você precisa. Imprime com a boca na mesa, sem suporte.",
    icon: Filter,
    defaults: DEFAULT_FUNNEL,
    sections: [
      {
        title: "Medidas (de fora)",
        fields: [
          num("topD", "Diâmetro da boca", 20, 220, { step: 1 }),
          num("neckD", "Diâmetro do bico", 8, 80, { step: 0.5, hint: "O bico entra no gargalo: use um pouco menos que o furo dele. Garrafa PET: 20 mm; óleo de motor: 25 mm." }),
          num("coneH", "Altura do cone", 15, 100, { step: 1, hint: "Quanto mais alto, mais suave: cone de mais de 45° precisa de suporte." }),
          num("neckLen", "Comprimento do bico", 5, 100, { step: 1 }),
          num("wall", "Parede", 1, 4, { step: 0.2 }),
          bool("bead", "Borda reforçada na boca"),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildFunnel(ctx, as(p)),
  },
  {
    id: "oring",
    category: "home",
    label: "O-ring",
    blurb: "Anel de borracha pelo diâmetro interno e pela seção, em TPU, com várias na mesma mesa. Serve para reposição leve e poeira.",
    icon: Disc,
    defaults: DEFAULT_ORING,
    sections: [
      {
        title: "Medidas",
        fields: [
          num("innerD", "Diâmetro interno", 3, 100, { step: 0.5, hint: "O furo do anel, como na etiqueta: 20 × 3 é 20 mm de furo e 3 mm de seção." }),
          num("cord", "Seção (espessura do fio)", 1, 8, { step: 0.5 }),
          num("quantity", "Quantidade", 1, 30, { step: 1, unit: "" }),
          bool("flat", "Achatar um pouco o fundo e o topo (assenta na mesa)"),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildORing(ctx, as(p)),
  },
  {
    id: "seal",
    category: "home",
    label: "Retentor",
    blurb: "Anel de TPU com lábio que encosta no eixo, pelas medidas do eixo, do alojamento e da largura. Para graxa e poeira em eixo lento.",
    icon: CircleDot,
    defaults: DEFAULT_SEAL,
    sections: [
      {
        title: "Medidas",
        fields: [
          num("shaftD", "Diâmetro do eixo", 4, 100, { step: 0.5 }),
          num("housingD", "Diâmetro do alojamento", 10, 140, { step: 0.5, hint: "O furo onde o retentor entra. A peça sai 0,2 mm maior para prender." }),
          num("width", "Largura", 3, 20, { step: 0.5 }),
          num("interference", "Aperto do lábio no eixo", 0.1, 1.5, { step: 0.1, hint: "0,4 vedando sem prender o eixo; aumente se vazar graxa, diminua se esquentar." }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildSeal(ctx, as(p)),
  },
  {
    id: "spoolHolder",
    category: "home",
    label: "Suporte de carretel",
    blurb: "Base com dois postes e um eixo solto: o carretel gira apoiado só no eixo, pelas medidas do seu carretel.",
    icon: Cylinder,
    defaults: DEFAULT_SPOOL_HOLDER,
    sections: [
      {
        title: "O carretel",
        fields: [
          num("spoolD", "Diâmetro do carretel", 100, 300, { step: 1, hint: "Carretel de 1 kg: 195 a 200 mm; de 250 g: 140 mm." }),
          num("spoolW", "Largura entre as abas", 30, 120, { step: 1, hint: "1 kg: 55 a 70 mm. Meça o carretel que você mais usa." }),
          num("hole", "Furo central", 20, 80, { step: 0.5, hint: "O mais comum é 52 a 53 mm." }),
          num("clearance", "Folga do eixo no furo", 0.5, 3, { step: 0.25, hint: "1 mm de cada lado deixa o carretel girar solto." }),
        ],
      },
      {
        title: "Encaixe e cores",
        fields: [
          num("socketGap", "Folga do eixo nos postes", 0.1, 0.6, { step: 0.05, hint: "0,25 entra com leve pressão; se o eixo agarrar, aumente." }),
          num("thickness", "Espessura dos postes", 5, 14, { step: 1 }),
          num("axleWall", "Parede do eixo (oco)", 2.5, 8, { step: 0.5, hint: "O eixo é um tubo: 3 a 4 mm aguenta o carretel e gasta bem menos filamento. O peso aparece abaixo." }),
          choice("axleParts", "Eixo", [["one", "Inteiro"], ["two", "Em 2 partes que rosqueiam"]]),
          color("color", "Base"),
          color("axleColor", "Eixo"),
        ],
      },
    ],
    build: (ctx, p) => buildSpoolHolder(ctx, as(p)),
  },
  {
    id: "drillJig",
    category: "home",
    label: "Gabarito de furação",
    blurb: "Bloco com furos-guia em linha, na distância da borda que você pede, com batente para encostar na peça. A broca não sai do prumo.",
    icon: Crosshair,
    defaults: DEFAULT_DRILL_JIG,
    sections: [
      {
        title: "Furos",
        fields: [
          num("holes", "Quantidade de furos", 1, 10, { step: 1, unit: "" }),
          num("drillD", "Diâmetro da broca", 1.5, 20, { step: 0.5, hint: "O furo-guia sai com a folga abaixo a mais." }),
          num("pitch", "Distância entre furos", 10, 100, { step: 0.5, hint: "De centro a centro. Furação de prateleira: 32 mm." }),
          num("edgeDist", "Distância do furo à borda", 3, 60, { step: 0.5, hint: "Da face do batente ao centro do furo." }),
          num("thickness", "Altura do gabarito", 4, 30, { step: 1, hint: "Quanto mais alto, melhor a guia: pelo menos uma vez o diâmetro da broca." }),
          num("clearance", "Folga da broca", 0.1, 0.8, { step: 0.05 }),
          bool("lip", "Batente na borda"),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildDrillJig(ctx, as(p)),
  },
  {
    id: "radiusGauge",
    category: "home",
    label: "Gabarito de raios",
    blurb: "Uma lâmina por raio, com entalhe e ponta redondos, para conferir quinas arredondadas e cantos de dentro. O valor vem gravado.",
    icon: Ruler,
    font: true,
    defaults: DEFAULT_RADIUS_GAUGE,
    sections: [
      {
        title: "Raios",
        fields: [
          text("radii", "Raios (mm, separados por espaço ou ;)", 80, "Escreva como no Brasil: 1; 1,5; 2; 3; 5 (a vírgula é o decimal). De 0,1 a 40 mm."),
          num("thickness", "Espessura", 1.2, 5, { step: 0.2 }),
          num("font", "Altura do número", 3, 8, { step: 0.5 }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildRadiusGauge(ctx, as(p)),
  },
  {
    id: "labelJig",
    category: "home",
    label: "Gabarito de etiqueta",
    blurb: "Moldura com a janela do tamanho da etiqueta (mais 0,4 mm de folga) para colar sempre no mesmo lugar, com entalhes para o polegar.",
    icon: RectangleHorizontal,
    defaults: DEFAULT_LABEL_JIG,
    sections: [
      {
        title: "Etiqueta",
        fields: [
          num("labelW", "Largura da etiqueta", 10, 200, { step: 0.5 }),
          num("labelH", "Altura da etiqueta", 8, 150, { step: 0.5 }),
          num("rim", "Largura da moldura", 6, 30, { step: 1 }),
          num("round", "Canto arredondado", 0.5, 10, { step: 0.5 }),
          num("thickness", "Espessura", 1.2, 5, { step: 0.2 }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildLabelJig(ctx, as(p)),
  },
];
