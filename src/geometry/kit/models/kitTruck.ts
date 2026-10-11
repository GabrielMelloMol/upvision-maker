import { poly, rect } from "../joints";
import type { KitTemplate } from "../types";
import { buildVehicle, VEHICLE_PALETTE, type Ledge, type Wall } from "./vehicle";

/** Caminhão de montar: cabine e carroceria nas laterais, chassi, capô, teto da cabine, parede da cabine e traseira; 2 ou 3 eixos. */
export const KIT_TRUCK: KitTemplate = {
  id: "kitTruck",
  label: "Kit: caminhão",
  blurb: "Caminhão de montar projetado peça por peça: cabine com janela, carroceria aberta, chassi, capô, teto, traseira e rodas que giram no eixo.",
  palette: VEHICLE_PALETTE,
  artTargets: [["lateral1", "Lateral direita"], ["lateral2", "Lateral esquerda"], ["traseira", "Traseira"], ["teto", "Teto da cabine"], ["chassi", "Chassi"]],
  defaults: { length: 120, width: 40, cabinH: 28, boxH: 24, cabLen: 32, axlesN: 2, wheelD: 20, tire: 2, press: 0.05 },
  sections: [
    {
      title: "Proporções",
      fields: [
        { k: "length", kind: "num", label: "Comprimento", min: 80, max: 170, step: 1, unit: "mm" },
        { k: "width", kind: "num", label: "Largura", min: 30, max: 60, step: 1, unit: "mm", hint: "Distância entre as laterais." },
        { k: "cabLen", kind: "num", label: "Comprimento da cabine", min: 24, max: 42, step: 1, unit: "%", hint: "Em % do comprimento total." },
        { k: "cabinH", kind: "num", label: "Altura da cabine", min: 20, max: 40, step: 1, unit: "mm" },
        { k: "boxH", kind: "num", label: "Altura da carroceria", min: 14, max: 36, step: 1, unit: "mm" },
      ],
    },
    {
      title: "Rodas e eixos",
      fields: [
        { k: "axlesN", kind: "num", label: "Eixos", min: 2, max: 3, step: 1, hint: "3 = dois eixos juntos atrás (truque)." },
        { k: "wheelD", kind: "num", label: "Diâmetro das rodas", min: 14, max: 32, step: 1, unit: "mm" },
        { k: "tire", kind: "num", label: "Espessura do pneu", min: 0, max: 2.5, step: 0.5, unit: "mm", hint: "0 = sem pneu. O pneu sai em outra cor, num anel em volta da roda." },
        { k: "spin", kind: "num", label: "Folga do giro da roda", min: 0.2, max: 0.6, step: 0.05, unit: "mm", hint: "Folga do pino no furo da lateral: a roda gira. Aumente se agarrar." },
        { k: "press", kind: "num", label: "Aperto da trava", min: 0, max: 0.2, step: 0.05, unit: "mm", hint: "Folga do furo da trava sobre o pino: 0,05 aperta; aumente se não entrar." },
      ],
    },
  ],
  build: (env) => {
    const { M, k, scale: s, t, fit, p } = env;
    const L = Number(p.length) * s, Wi = Number(p.width) * s, Hr = Number(p.cabinH) * s, Hbox = Number(p.boxH) * s;
    const Hb = Math.min(0.55 * Hr, Hr - 12 * s); // altura do capô
    const wheel = (Number(p.wheelD) / 2) * s, tire = Math.min(Number(p.tire) * s, wheel - 4);
    const xf = L / 2, xr = -L / 2, Lc = (Number(p.cabLen) / 100) * L;
    const x3 = xf - Lc, xHoodEnd = xf - 0.03 * L, x1 = xf - 0.12 * L, x2 = x1 - 0.06 * L;
    const profile = poly(M, k, [[xr, 0], [xf, 0], [xf, 0.8 * Hb], [xHoodEnd, Hb], [x1, Hb], [x2, Hr], [x3, Hr], [x3, Hbox], [xr, Hbox]]);
    // janela da cabine: o miolo encolhido (coluna de 3 mm), com a coluna de trás larga para a parede da cabine
    const cabin = poly(M, k, [[x1, Hb], [x2, Hr], [x3, Hr], [x3, Hb]]);
    const glass = k(k(cabin.offset(-3, "Miter")).subtract(rect(M, k, x3 - 1, 0, x3 + 6 * s, Hr + 1)));
    const wallX = x3 + 3 * s;
    const tabW = (len: number) => Math.min(8 * s, 0.5 * len);
    const ledge = (id: string, label: string, color: string, a: number, b: number, y: number): Ledge => ({ id, label, color, x0: a, x1: b, y, tabs: [(a + b) / 2], tabW: tabW(b - a) });
    const ledges: Ledge[] = [ledge("capo", "Capô", "cab", x1 + 0.6, xHoodEnd - 0.6, Hb), ledge("teto", "Teto da cabine", "cab", x3 + 0.6, x2 - 0.6, Hr)];
    const tabH = (h: number) => Math.min(8 * s, 0.4 * h);
    const walls: Wall[] = [
      { id: "paredeCabine", label: "Parede da cabine", color: "cab", x: wallX, y0: 0, y1: Hr - 4 * s, tabY: 0.5 * (Hr - 4 * s), tabH: tabH(Hr) },
      { id: "traseira", label: "Traseira", color: "body", x: xr + 1.5 * s + (t + fit) / 2 + 1, y0: 0, y1: Hbox - 1.5 * s, tabY: 0.5 * Hbox, tabH: tabH(Hbox) },
    ];
    const rear = xr + 0.2 * L;
    const gap = 2 * wheel + 3 * s;
    const axles = Number(p.axlesN) >= 3 ? [xf - 0.18 * L, rear, rear + gap] : [xf - 0.18 * L, rear];
    return buildVehicle(env, {
      profile, cutouts: [glass], length: L, width: Wi, wheel, tire, axles,
      floor: { x0: xr + 0.02 * L, x1: xf - 0.02 * L, tabs: [-0.3 * L, 0.08 * L], tabW: 8 * s },
      ledges, walls,
      steps: [
        "Encaixe as laterais {lateral1} e {lateral2} nas janelas do chassi {chassi}.",
        "Encaixe a parede da cabine {paredeCabine} e a traseira {traseira} pelas abas nas janelinhas das laterais.",
        "Apoie o capô {capo} e o teto {teto} nas bordas das laterais, com as abas passando pelas janelinhas.",
        "Prenda cada roda {roda} pelo pino no furo da lateral (de fora para dentro) e aperte a trava {trava} na ponta do pino, por dentro: a roda tem que girar.",
      ],
    });
  },
};
