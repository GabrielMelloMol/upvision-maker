import { Cog, Link2, Orbit, Disc3, Cable, Gauge } from "lucide-react";
import {
  buildBelt, buildChain, buildPlanetary, buildPulley, buildSprocket, buildSpurGear,
  DEFAULT_BELT, DEFAULT_CHAIN, DEFAULT_PLANETARY, DEFAULT_PULLEY, DEFAULT_SPROCKET, DEFAULT_SPUR_GEAR, SPROCKET_PRESETS,
  type SprocketParams,
} from "../../../geometry/models/mechanics";
import { as, bool, choice, color, num, type ModelDef } from "../fields";

const PITCHES = [["2", "GT2 (passo 2 mm)"], ["3", "HTD 3M (passo 3 mm)"]] as const;
const PRESETS = [["ansi35", "ANSI 35 (passo 9,525)"], ["ansi25", "ANSI 25 (passo 6,35)"], ["06b", "06B (passo 9,525)"], ["08b", "08B (passo 12,7)"], ["custom", "Medidas livres"]] as const;
const sprocket = (p: Record<string, string | number | boolean>): SprocketParams => {
  const preset = SPROCKET_PRESETS[String(p.preset)];
  return { ...(as<SprocketParams>(p)), ...(preset ?? {}) };
};

/** Peças mecânicas para FDM (#230): engrenagem e par, polia e correia dentada, roda dentada e corrente, redutor planetário. */
export const MECHANIC_MODELS: ModelDef[] = [
  {
    id: "spurGear",
    category: "organize",
    label: "Engrenagem (e o par engrenado)",
    blurb: "Dentes de involuta pelo módulo e número de dentes, com folga para FDM. Mostra a segunda engrenagem à distância certa entre os eixos.",
    icon: Cog,
    defaults: DEFAULT_SPUR_GEAR,
    sections: [
      {
        title: "Dentes",
        fields: [
          num("teeth", "Dentes", 9, 120, { step: 1, unit: "" }),
          num("module", "Módulo", 0.8, 5, { step: 0.1, hint: "Tamanho do dente. As duas engrenagens do par precisam do mesmo módulo." }),
          num("pressure", "Ângulo de pressão", 14.5, 25, { step: 0.5, unit: "°" }),
          num("backlash", "Folga entre os dentes", 0, 0.6, { step: 0.05, hint: "0,2 mm serve para a maioria das impressoras; aumente se os dentes travarem." }),
        ],
      },
      {
        title: "Corpo",
        fields: [
          num("thickness", "Espessura", 2, 40, { step: 0.5 }),
          num("bore", "Furo do eixo", 2, 40, { step: 0.5 }),
          bool("hub", "Cubo (reforço em volta do furo)"),
          color("color", "Cor"),
        ],
      },
      {
        title: "Par engrenado",
        fields: [bool("pair", "Mostrar a segunda engrenagem"), num("teeth2", "Dentes da segunda", 9, 120, { step: 1, unit: "" })],
      },
    ],
    build: (ctx, p) => buildSpurGear(ctx, as(p)),
  },
  {
    id: "pulley",
    category: "organize",
    label: "Polia de correia dentada",
    blurb: "GT2 ou HTD 3M, com aba nos dois lados e cubo com parafuso de fixação. Os vãos levam a folga da sua impressora.",
    icon: Disc3,
    defaults: { ...DEFAULT_PULLEY, pitch: "2" },
    sections: [
      {
        title: "Polia",
        fields: [
          choice("pitch", "Correia", PITCHES),
          num("teeth", "Dentes", 12, 80, { step: 1, unit: "" }),
          num("bore", "Furo do eixo", 2, 20, { step: 0.5 }),
          num("width", "Largura (para a correia)", 4, 20, { step: 0.5 }),
          num("clearance", "Folga nos vãos", 0, 0.5, { step: 0.05 }),
          bool("flange", "Aba nos dois lados"),
          bool("setScrew", "Cubo com parafuso M3"),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildPulley(ctx, { ...as<typeof DEFAULT_PULLEY>(p), pitch: Number(p.pitch) }),
  },
  {
    id: "timingBelt",
    category: "organize",
    label: "Correia dentada fechada",
    blurb: "Anel com dentes por dentro, no passo da polia, para imprimir em TPU. O comprimento é dentes × passo.",
    icon: Cable,
    defaults: { ...DEFAULT_BELT, pitch: "2" },
    sections: [
      {
        title: "Correia",
        fields: [
          choice("pitch", "Passo", PITCHES),
          num("teeth", "Dentes", 20, 200, { step: 1, unit: "" }),
          num("width", "Largura", 3, 20, { step: 0.5 }),
          num("thickness", "Costas da correia", 0.8, 3, { step: 0.1 }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildBelt(ctx, { ...as<typeof DEFAULT_BELT>(p), pitch: Number(p.pitch) }),
  },
  {
    id: "sprocket",
    category: "organize",
    label: "Roda dentada de corrente",
    blurb: "Para corrente de roletes (ANSI 25, 35, 06B, 08B): assentos redondos para cada rolete, com a folga da impressora.",
    icon: Gauge,
    defaults: { ...DEFAULT_SPROCKET, preset: "ansi35" },
    sections: [
      {
        title: "Roda",
        fields: [
          choice("preset", "Corrente", PRESETS),
          num("teeth", "Dentes", 9, 60, { step: 1, unit: "" }),
          num("bore", "Furo do eixo", 2, 30, { step: 0.5 }),
          num("clearance", "Folga do rolete", 0, 0.6, { step: 0.05 }),
          color("color", "Cor"),
        ],
      },
      {
        title: "Medidas livres",
        fields: [
          num("pitch", "Passo", 4, 25, { step: 0.025, hint: "Só vale em “Medidas livres”." }),
          num("roller", "Diâmetro do rolete", 2, 15, { step: 0.05 }),
          num("width", "Espessura da roda", 2, 15, { step: 0.1 }),
        ],
      },
    ],
    build: (ctx, p) => buildSprocket(ctx, sprocket(p)),
  },
  {
    id: "chain",
    category: "organize",
    label: "Corrente articulada",
    blurb: "Elos impressos já encaixados, soltos entre si pela folga. Imprima de uma vez, sem suporte e sem montar.",
    icon: Link2,
    defaults: DEFAULT_CHAIN,
    sections: [
      {
        title: "Corrente",
        fields: [
          num("links", "Elos", 3, 30, { step: 1, unit: "" }),
          num("pitch", "Distância entre pinos", 10, 40, { step: 0.5 }),
          num("width", "Largura do elo", 6, 24, { step: 0.5 }),
          num("thickness", "Espessura", 2.4, 8, { step: 0.2 }),
          num("gap", "Folga entre os elos", 0.2, 0.6, { step: 0.05, hint: "Se os elos grudarem, aumente de 0,05 em 0,05 mm." }),
          color("color", "Cor"),
        ],
      },
    ],
    build: (ctx, p) => buildChain(ctx, as(p)),
  },
  {
    id: "planetary",
    category: "organize",
    label: "Redutor planetário",
    blurb: "Sol, planetas, coroa e porta-satélites. Os dentes só fecham quando (sol + coroa) é múltiplo do número de planetas; o app avisa e ajusta.",
    icon: Orbit,
    defaults: DEFAULT_PLANETARY,
    sections: [
      {
        title: "Engrenagens",
        fields: [
          num("sun", "Dentes do sol", 9, 24, { step: 1, unit: "" }),
          num("planet", "Dentes de cada planeta", 9, 24, { step: 1, unit: "" }),
          num("planets", "Planetas", 2, 6, { step: 1, unit: "" }),
          num("module", "Módulo", 0.8, 1.8, { step: 0.1, hint: "Até 1,8 para o conjunto caber numa mesa de 256 mm." }),
          num("backlash", "Folga entre os dentes", 0.1, 0.5, { step: 0.05 }),
        ],
      },
      {
        title: "Corpo",
        fields: [
          num("thickness", "Espessura", 4, 20, { step: 0.5 }),
          num("wall", "Parede da coroa", 2, 6, { step: 0.5 }),
          num("bore", "Furo e eixo dos planetas", 3, 10, { step: 0.5 }),
          color("color", "Engrenagens"),
          color("carrierColor", "Porta-satélites"),
        ],
      },
    ],
    build: (ctx, p) => buildPlanetary(ctx, as(p)),
  },
];
