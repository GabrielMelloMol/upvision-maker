import { poly, rect } from "../joints";
import type { KitTemplate } from "../types";
import { buildVehicle, lateralBase, minWheel, VEHICLE_PALETTE, type Ledge, type Wall } from "./vehicle";

/** Carro de montar: laterais com janelas, chassi, capô, teto e porta-malas; rodas que giram no pino, presas por travas. */
export const KIT_CAR: KitTemplate = {
  id: "kitCar",
  label: "Kit: carro",
  blurb: "Carro de montar projetado peça por peça: laterais com janelas, chassi, capô, teto e porta-malas encaixados, rodas que giram no eixo.",
  palette: VEHICLE_PALETTE,
  artTargets: [["lateral1", "Lateral direita"], ["lateral2", "Lateral esquerda"], ["capo", "Capô"], ["teto", "Teto"], ["chassi", "Chassi"]],
  defaults: { length: 90, width: 32, bodyH: 15, cabinH: 13, wheelD: 19, tire: 1.5, press: 0.05 },
  sections: [
    {
      title: "Proporções",
      fields: [
        { k: "length", kind: "num", label: "Comprimento", min: 60, max: 140, step: 1, unit: "mm" },
        { k: "width", kind: "num", label: "Largura", min: 28, max: 56, step: 1, unit: "mm", hint: "Distância entre as laterais." },
        { k: "bodyH", kind: "num", label: "Altura da carroceria", min: 8, max: 22, step: 1, unit: "mm", hint: "Nunca fica abaixo do topo das rodas: se você aumentar a roda, a carroceria sobe junto." },
        { k: "cabinH", kind: "num", label: "Altura da cabine", min: 10, max: 24, step: 1, unit: "mm" },
      ],
    },
    {
      title: "Rodas e eixos",
      fields: [
        { k: "wheelD", kind: "num", label: "Diâmetro das rodas", min: 12, max: 30, step: 1, unit: "mm" },
        { k: "tire", kind: "num", label: "Espessura do pneu", min: 0, max: 2.5, step: 0.5, unit: "mm", hint: "0 = sem pneu. O pneu sai em outra cor, num anel em volta da roda." },
        { k: "spin", kind: "num", label: "Folga do giro da roda", min: 0.2, max: 0.6, step: 0.05, unit: "mm", hint: "Folga do pino no furo da lateral: a roda gira. Aumente se agarrar." },
        { k: "press", kind: "num", label: "Aperto da trava", min: 0.04, max: 0.2, step: 0.05, unit: "mm", hint: "Folga do furo da trava sobre o pino: 0,05 aperta; aumente se não entrar." },
      ],
    },
  ],
  build: (env) => {
    const { M, k, scale: s, p } = env;
    const L = Number(p.length) * s, Wi = Number(p.width) * s;
    const wheel = Math.max((Number(p.wheelD) / 2) * s, minWheel(env.t)), tire = Math.min(Number(p.tire) * s, wheel - 4);
    // a linha do capô e do porta-malas fica acima do topo das rodas (senão elas aparecem por cima do corpo)
    const Hb = Math.max(Number(p.bodyH) * s, 2 * wheel - lateralBase(env, wheel).zl0 + 1.5 * s), Hr = Hb + Number(p.cabinH) * s;
    const xf = L / 2, xr = -L / 2;
    const xHoodEnd = xf - 0.05 * L, x1 = 0.18 * L, x2 = x1 - 0.12 * L, x3 = -0.14 * L, x4 = x3 - 0.1 * L, xTrunk = xr + 0.05 * L;
    const profile = poly(M, k, [[xr, 0], [xf, 0], [xf, 0.75 * Hb], [xHoodEnd, Hb], [x1, Hb], [x2, Hr], [x3, Hr], [x4, Hb], [xTrunk, Hb], [xr, 0.75 * Hb]]);
    // janelas: a cabine encolhida (coluna de 3 mm), com uma coluna central
    const cabin = poly(M, k, [[x1, Hb], [x2, Hr], [x3, Hr], [x4, Hb]]);
    const glass = k(cabin.offset(-3, "Miter"));
    const pillar = rect(M, k, (x2 + x3) / 2 - 1.5 * s, 0, (x2 + x3) / 2 + 1.5 * s, Hr + 1);
    const cutouts = [k(glass.subtract(pillar))];
    const tabW = (len: number) => Math.min(8 * s, 0.5 * len);
    const ledge = (id: string, label: string, color: string, a: number, b: number, y: number): Ledge => ({ id, label, color, x0: a, x1: b, y, tabs: [(a + b) / 2], tabW: tabW(b - a) });
    const ledges: Ledge[] = [
      ledge("capo", "Capô", "body", x1 + 0.6, xHoodEnd - 0.6, Hb),
      ledge("teto", "Teto", "cab", x3 + 0.6, x2 - 0.6, Hr),
      ledge("malas", "Porta-malas", "body", xTrunk + 0.6, x4 - 0.6, Hb),
    ];
    const wallH = 0.7 * Hb, tabH = Math.min(8 * s, 0.4 * wallH);
    const walls: Wall[] = [
      { id: "frente", label: "Frente", color: "body", x: xf - 3.2 * s, y0: 0, y1: wallH, tabY: wallH / 2, tabH },
      { id: "fundo", label: "Traseira", color: "body", x: xr + 3.2 * s, y0: 0, y1: wallH, tabY: wallH / 2, tabH },
    ];
    return buildVehicle(env, {
      profile, cutouts, length: L, width: Wi, wheel, tire, axles: [-0.3 * L, 0.3 * L],
      floor: { x0: xr + 0.02 * L, x1: xf - 0.02 * L, tabs: [-0.2 * L, 0.2 * L], tabW: 8 * s },
      ledges, walls,
      steps: [
        "Encaixe as laterais {lateral1} e {lateral2} nas janelas do chassi {chassi}, e feche as pontas com a frente {frente} e a traseira {fundo}, pelas abas nas janelinhas.",
        "Apoie o capô {capo}, o teto {teto} e o porta-malas {malas} nas bordas das laterais, com as abas passando pelas janelinhas.",
        "Prenda cada roda {roda} pelo pino no furo da lateral (de fora para dentro) e aperte a trava {trava} na ponta do pino, por dentro: a roda tem que girar.",
      ],
    });
  },
};
