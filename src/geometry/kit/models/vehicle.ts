import { nozzleMm } from "../../bed";
import type { CS } from "../../manifold";
import { disc, pinHole, rect, tabWindow } from "../joints";
import type { K, KitBuild, KitEnv, KitPair, KitPalette, KitPart, Placement } from "../types";

/**
 * Veículo de montar (carro, caminhão): duas laterais de pé nas janelas do chassi, placas que apoiam nas bordas das laterais
 * (capô, teto, porta-malas) e placas em pé entre elas (parede da carroceria, traseira); rodas que GIRAM no pino que atravessa
 * a lateral (furo = pino + spin) e uma trava apertada na ponta do pino, por dentro. Tudo plano, tudo com folga.
 *
 * Coordenadas: o veículo anda para +x; y é a largura; z é a altura (z = 0 é o chão). Na lateral (plano XY impresso), x é o
 * comprimento e y a altura acima da borda de baixo da lateral.
 */

export const VEHICLE_PALETTE: KitPalette = [
  { key: "body", label: "Carroceria", default: "#c0392b" },
  { key: "chassis", label: "Chassi", default: "#1c1c1e" },
  { key: "cab", label: "Cabine", default: "#2f6fb0" },
  { key: "wheel", label: "Rodas", default: "#f4f4f2" },
  { key: "tire", label: "Pneus", default: "#1c1c1e" },
  { key: "lock", label: "Travas", default: "#1c1c1e" },
];

/** Placa horizontal que apoia na borda de cima da lateral (em `y`), presa por uma aba de cada lado em `tabs`. */
export type Ledge = { id: string; label: string; color: string; x0: number; x1: number; y: number; tabs: number[]; tabW: number };
/** Placa em pé entre as laterais, de `y0` a `y1` (acima da borda de baixo), com uma aba em cada ponta, na altura `tabY`. */
export type Wall = { id: string; label: string; color: string; x: number; y0: number; y1: number; tabY: number; tabH: number };

export type VehicleGeom = {
  /** contorno da lateral: x = comprimento, y = altura acima da borda de baixo (y ≥ 0) */
  profile: CS;
  /** janelas e vãos cortados da lateral */
  cutouts: CS[];
  length: number;
  /** distância entre os planos das laterais */
  width: number;
  /** raio da roda e espessura do pneu */
  wheel: number;
  tire: number;
  /** x dos eixos */
  axles: number[];
  floor: { x0: number; x1: number; tabs: number[]; tabW: number };
  ledges: Ledge[];
  walls: Wall[];
  steps: string[];
  /** artTargets do modelo */
  warnings?: string[];
};

const WALL_MM = 1.2; // borda do chassi além da janela
const WHEEL_SIDE_GAP = 0.5; // vão entre a roda e o chassi
const AXIAL_PLAY = 0.3; // folga da trava na lateral (a roda gira)

/** Medidas do eixo que dependem do bico e das folgas. */
export const pinRadius = () => Math.max(1.5, 2 * nozzleMm());

/** Monta as peças, a montagem e os pares de um veículo a partir da geometria dele. */
export function buildVehicle(env: KitEnv, g: VehicleGeom): KitBuild {
  const { M, k, t, fit, pinFit } = env;
  const spin = Number(env.p.spin ?? 0.3), press = Number(env.p.press ?? 0.05);
  const pinR = pinRadius();
  const Wi = g.width, fw = Wi / 2 + (t + fit) / 2 + WALL_MM; // meia largura das placas
  const holeR = pinR + spin / 2;
  const zl0 = Math.max(t + 0.4, g.wheel - holeR - 2.4); // altura da borda de baixo da lateral
  const zf = zl0 - t; // chão do chassi
  const axleY = g.wheel - zl0; // altura do eixo na lateral
  const gapW = fit / 2 + WALL_MM + WHEEL_SIDE_GAP;
  const yIn = Wi / 2 + t / 2 + gapW; // face de dentro da roda (módulo de y)
  const tIn = Wi / 2 - t / 2 - AXIAL_PLAY; // face da trava junto da lateral, por dentro
  const pinLen = yIn - (tIn - t) + 0.05; // do rosto da roda até a face de dentro da trava
  const rect_ = (x0: number, y0: number, x1: number, y1: number) => rect(M, k, x0, y0, x1, y1);

  // lateral: contorno + abas (em cima nas placas, embaixo no chassi) − janelas − furos dos eixos − janelas das paredes
  const tabsUp = g.ledges.flatMap((l) => l.tabs.map((x) => rect_(x - l.tabW / 2, l.y - 0.01, x + l.tabW / 2, l.y + t)));
  const tabsDown = g.floor.tabs.map((x) => rect_(x - g.floor.tabW / 2, -t, x + g.floor.tabW / 2, 0.01));
  const wallWin = g.walls.map((w) => rect_(w.x - (t + fit) / 2, w.tabY - (w.tabH + fit) / 2, w.x + (t + fit) / 2, w.tabY + (w.tabH + fit) / 2));
  const holes = g.axles.map((x) => pinHole(M, k, { x, y: axleY, r: pinR, fit: spin }));
  const lateral = k(k(M.CrossSection.union([g.profile, ...tabsUp, ...tabsDown])).subtract(k(M.CrossSection.union([...g.cutouts, ...wallWin, ...holes]))));
  const lateralL = k(lateral.mirror([1, 0]));

  // chassi e placas
  const windowsAt = (xs: number[], tabW: number) => xs.flatMap((x) => [-Wi / 2, Wi / 2].map((y) => tabWindow(M, k, { cx: x, cy: y, tabW, t, fit })));
  const plate = (x0: number, x1: number, xs: number[], tabW: number) => k(rect_(x0, -fw, x1, fw).subtract(k(M.CrossSection.union(windowsAt(xs, tabW)))));
  const parts: KitPart[] = [
    { id: "chassi", label: "Chassi", layers: [{ cs: plate(g.floor.x0, g.floor.x1, g.floor.tabs, g.floor.tabW), color: "chassis" }] },
    { id: "lateral1", label: "Lateral direita", layers: [{ cs: lateral, color: "body" }] },
    { id: "lateral2", label: "Lateral esquerda", layers: [{ cs: lateralL, color: "body" }] },
  ];
  for (const l of g.ledges) parts.push({ id: l.id, label: l.label, layers: [{ cs: plate(l.x0, l.x1, l.tabs, l.tabW), color: l.color }] });
  const P = Wi - t - fit, tabL = t + fit / 2;
  for (const w of g.walls) {
    const body = rect_(-P / 2, w.y0, P / 2, w.y1);
    const tabs = [-1, 1].map((s) => (s < 0 ? rect_(-P / 2 - tabL, w.tabY - w.tabH / 2, -P / 2 + 0.01, w.tabY + w.tabH / 2) : rect_(P / 2 - 0.01, w.tabY - w.tabH / 2, P / 2 + tabL, w.tabY + w.tabH / 2)));
    parts.push({ id: w.id, label: w.label, layers: [{ cs: k(M.CrossSection.union([body, ...tabs])), color: w.color }] });
  }

  // rodas (cubo + pneu, pino em pé) e travas
  const nW = 2 * g.axles.length;
  const rHub = g.wheel - g.tire;
  const wheelLayers = g.tire > 0.1 ? [{ cs: k(disc(M, k, 0, 0, g.wheel, 64).subtract(disc(M, k, 0, 0, rHub, 64))), color: "tire" }, { cs: disc(M, k, 0, 0, rHub, 64), color: "wheel" }] : [{ cs: disc(M, k, 0, 0, g.wheel, 64), color: "wheel" }];
  parts.push({ id: "roda", label: "Roda", count: nW, layers: wheelLayers, pins: [{ x: 0, y: 0, r: pinR, len: pinLen, color: "wheel" }] });
  const lockR = pinR + 2.4;
  parts.push({ id: "trava", label: "Trava", count: nW, layers: [{ cs: k(disc(M, k, 0, 0, lockR).subtract(pinHole(M, k, { x: 0, y: 0, r: pinR, fit: press }))), color: "lock" }] });

  // montagem
  const A: Placement[] = [{ part: "chassi", translate: [0, 0, zf] }];
  A.push({ part: "lateral1", rotate: [90, 0, 0], translate: [0, Wi / 2 + t / 2, zl0] });
  A.push({ part: "lateral2", rotate: [90, 0, 180], translate: [0, -(Wi / 2 + t / 2), zl0] });
  for (const l of g.ledges) A.push({ part: l.id, translate: [0, 0, zl0 + l.y] });
  for (const w of g.walls) A.push({ part: w.id, rotate: [90, 0, 90], translate: [w.x - t / 2, 0, zl0] });
  let n = 0;
  for (const x of g.axles)
    for (const side of [1, -1]) {
      n++;
      const rot: [number, number, number] = [side * 90, 0, 0];
      A.push({ part: "roda", index: n, rotate: rot, translate: [x, side === 1 ? yIn + t : -yIn - t, g.wheel] });
      A.push({ part: "trava", index: n, rotate: rot, translate: [x, side === 1 ? tIn : -tIn, g.wheel] });
    }

  // pares intencionais: abas × janelas, pinos × furos
  const pairs: KitPair[] = [];
  for (const lat of ["lateral1", "lateral2"]) {
    pairs.push({ a: lat, b: "chassi", kind: "tab-window", gap: fit });
    for (const l of g.ledges) pairs.push({ a: lat, b: l.id, kind: "tab-window", gap: fit });
    for (const w of g.walls) pairs.push({ a: lat, b: w.id, kind: "tab-window", gap: fit });
  }
  // a roda nº n (ímpar: lado direito, par: esquerdo) gira no furo da lateral do lado dela
  for (let i = 1; i <= nW; i++) {
    const lat = i % 2 ? "lateral1" : "lateral2";
    pairs.push({ a: lat, b: `roda#${i}`, kind: "pin-hole", gap: Math.max(spin, fit) });
    pairs.push({ a: lat, b: `trava#${i}`, kind: "pin-hole", gap: Math.max(spin, fit) + AXIAL_PLAY });
    pairs.push({ a: `roda#${i}`, b: `trava#${i}`, kind: "pin-hole", gap: press + 0.1 });
  }
  void pinFit;
  return { parts, assembly: A, steps: g.steps, pairs, warnings: g.warnings };
}

export type { K };
