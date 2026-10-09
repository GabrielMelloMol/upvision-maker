import { Cable, CircleDot, Cog, Sprout, Wind } from "lucide-react";
import { buildCableComb, DEFAULT_CABLE_COMB } from "../../../geometry/models/cableComb";
import { buildHoseAdapter, DEFAULT_HOSE_ADAPTER } from "../../../geometry/models/hoseAdapter";
import { buildKnob, DEFAULT_KNOB } from "../../../geometry/models/knob";
import { buildPlantMarker, DEFAULT_PLANT_MARKER } from "../../../geometry/models/plantMarker";
import { buildSpacer, DEFAULT_SPACER } from "../../../geometry/models/spacer";
import { as, bool, choice, color, num, text, type ModelDef } from "../fields";

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
];
