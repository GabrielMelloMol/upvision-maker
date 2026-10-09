import { bedMm } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { fitInto, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { slab, solidMesh, type ModelCtx, type ModelOutput } from "./common";

export type FoldLayout = "print" | "assembled" | "folded";

export type PhoneStandFoldParams = {
  angle: number; // inclinação do apoio na trava do meio; as outras duas ficam 10° para cada lado
  width: number; // largura do suporte
  height: number; // comprimento do apoio onde o aparelho encosta
  frontLength: number; // comprimento da base da frente (onde vai o nome)
  clearance: number; // folga das dobradiças, 0,3 a 0,5 mm
  text: string;
  textHeight: number;
  relief: number;
  layout: FoldLayout; // como sai no arquivo: aberto e deitado (imprimir), montado (só para ver) ou dobrado
  bodyColor: string;
  textColor: string;
};

export const DEFAULT_PHONE_STAND_FOLD: PhoneStandFoldParams = {
  angle: 55,
  width: 70,
  height: 60,
  frontLength: 45,
  clearance: 0.4,
  text: "",
  textHeight: 8,
  relief: 0.8,
  layout: "print",
  bodyColor: "#1c1c1e",
  textColor: "#f8f8f6",
};

export const FOLD_PLATE = 4.5; // espessura das placas
export const FOLD_BARREL = 5.5; // raio do tubo da dobradiça; o eixo fica nesta altura, o tubo encosta na mesa
const SWING_GAP = 2; // folga para a placa girar em volta da dobradiça
const RAIL_W = 5; // largura dos trilhos laterais da base (as orelhas da dobradiça de baixo)
const RAIL_H = 7.5; // altura dos trilhos: as travas são fendas na parte de cima deles
const PRONG_W = 4; // orelhas da dobradiça de cima, no apoio
const PIN_R = 3; // raio da base do pino cônico
const PIN_LEN = 2; // comprimento do pino; a 45° o cone se apoia sem suporte na impressão
const SEG = 24;
const LOCK_STEP = 10; // as travas ficam em ângulo − 10°, ângulo e ângulo + 10°
const SLOT_MARGIN = 1; // folga nas paredes da fenda, além do que a ponta da escora ocupa
const ARM_SLOT = 24; // o apoio tem um rasgo no meio, desta profundidade, onde a escora gira sem encostar nele
const SLOT_DEPTH = 4.5;
const SLOT_ENGAGE = 2.5; // quanto a ponta do escora entra na fenda na trava do meio
const BAR_LEN = 6; // a ponta da escora é uma barra que atravessa a largura e cai nas fendas dos dois trilhos
const SHAPE_FLAT = 180 / SEG / 2; // gira o círculo meia face: o tubo ganha um chão reto e cola na mesa

const rad = (d: number) => (d * Math.PI) / 180;

/** Medidas derivadas: larguras de cada peça, comprimento da escora e posição das fendas das travas. */
export function foldDims(p: PhoneStandFoldParams) {
  const c = p.clearance;
  const swing = FOLD_BARREL + SWING_GAP;
  const cradleW = p.width - 2 * RAIL_W - 2 * c; // o apoio cabe entre os trilhos, com folga
  const strutW = cradleW - 2 * PRONG_W - 2 * c;
  const lb = p.height;
  const locks = [p.angle - LOCK_STEP, p.angle, p.angle + LOCK_STEP];
  // altura da ponta da escora (canto de baixo) na trava do meio: entra SLOT_ENGAGE na fenda; as outras travas saem do mesmo comprimento
  const a0 = rad(p.angle);
  const lowTarget = RAIL_H - SLOT_ENGAGE;
  const strutLen = (FOLD_BARREL + lb * Math.sin(a0) - FOLD_BARREL * Math.cos(a0) - lowTarget) / Math.sin(a0);
  const slotY = locks.map((deg) => (lb + strutLen) * Math.cos(rad(deg)) - FOLD_BARREL * Math.sin(rad(deg))); // onde cai o canto de baixo da ponta
  // a ponta é uma barra inclinada: na altura do topo do trilho ela ocupa um trecho que vai de δ/tg(α) para trás a δ·tg(α) para a frente do canto
  const slots = locks.map((deg, i) => {
    const a = rad(deg);
    const low = FOLD_BARREL + lb * Math.sin(a) - FOLD_BARREL * Math.cos(a) - strutLen * Math.sin(a);
    const depth = Math.max(RAIL_H - low, 0);
    return { from: slotY[i] - depth / Math.tan(a) - SLOT_MARGIN, to: slotY[i] + depth * Math.tan(a) + SLOT_MARGIN, depth };
  });
  const railEnd = Math.max(...slots.map((x) => x.to)) + 3;
  const barStart = lb + strutLen - BAR_LEN;
  const flatLength = p.frontLength + lb + strutLen;
  return { c, swing, cradleW, strutW, lb, locks, strutLen, slotY, slots, railEnd, barStart, flatLength };
}

const box = (M: ManifoldToplevel, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Solid => scoped((k) => k(M.Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0]));

/** Perfil no plano (y, z): o círculo do tubo no eixo mais uma placa retangular. Extrudado ao longo de X. */
function profile(M: ManifoldToplevel, axisY: number, y0: number, y1: number, h: number): CS {
  return scoped((k) => {
    const disc = k(k(M.CrossSection.circle(FOLD_BARREL, SEG)).rotate(SHAPE_FLAT)).translate([axisY, FOLD_BARREL]);
    const rect = k(M.CrossSection.square([y1 - y0, h], false)).translate([y0, 0]);
    return M.CrossSection.union([k(disc), k(rect)]);
  });
}

/** O perfil (y, z) extrudado em X, de x0 a x1. */
function alongX(cs: CS, x0: number, x1: number): Solid {
  return scoped((k) => k(cs.extrude(x1 - x0)).transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, x0, 0, 0, 1]));
}

/** Cone no eixo da dobradiça: de `x` para dentro (dir = +1 para +X, −1 para −X), `r0` na base e fechando a 45°. */
function cone(M: ManifoldToplevel, axisY: number, x: number, dir: 1 | -1, r0: number, len: number): Solid {
  return scoped((k) => {
    const c = k(k(M.Manifold.cylinder(len, r0, r0 - len, SEG)).rotate([0, 90, 0]));
    const placed = k(c.translate([0, axisY, FOLD_BARREL]));
    return dir === 1 ? placed.translate([x, 0, 0]) : k(placed.mirror([1, 0, 0])).translate([x, 0, 0]);
  });
}

/** Pino cônico de uma orelha: sai da face de dentro e aponta para o tubo. */
const pin = (M: ManifoldToplevel, axisY: number, earInner: number, side: 1 | -1) => cone(M, axisY, earInner * side, (-side) as 1 | -1, PIN_R, PIN_LEN);

/**
 * Encaixe do pino no tubo: um cone um pouco maior (a folga medida na normal da face a 45° vale clearance), começando
 * na ponta do tubo. `end` é a face do tubo e `side` o lado em que ela fica.
 */
function socket(M: ManifoldToplevel, axisY: number, end: number, side: 1 | -1, c: number): Solid {
  const open = 0.5; // sai um pouco do tubo para o corte ficar limpo
  const r0 = PIN_R - c + c * Math.SQRT2 + open;
  return cone(M, axisY, side * (end + open), (-side) as 1 | -1, r0, PIN_LEN + open);
}

type Pieces = { base: Solid; cradle: Solid; strut: Solid };

/** As três peças na pose de impressão: deitadas, em fila ao longo de Y (base na frente, apoio e escora atrás). Dá delete() em cada uma. */
export function foldPieces(M: ManifoldToplevel, p: PhoneStandFoldParams): Pieces {
  const d = foldDims(p);
  const { c, swing, cradleW, strutW, lb } = d;
  const T = FOLD_PLATE;
  const half = p.width / 2;
  const earIn = half - RAIL_W; // face de dentro dos trilhos
  const cradleIn = cradleW / 2 - PRONG_W; // face de dentro das orelhas do apoio
  const unite = (k: <D extends { delete(): void }>(o: D) => D, parts: Solid[]) => M.Manifold.union(parts.map(k));

  const base = scoped((k) => {
    const front = box(M, -half, half, -p.frontLength, -swing, 0, T);
    const railCs = k(profile(M, 0, -swing - 0.5, d.railEnd, RAIL_H));
    const rails = [1, -1].map((s) => (s === 1 ? alongX(railCs, earIn, half) : alongX(railCs, -half, -earIn)));
    const slots = d.slots.map((x) => box(M, -half - 1, half + 1, x.from, x.to, RAIL_H - SLOT_DEPTH, RAIL_H + 1));
    const pins = [pin(M, 0, earIn, 1), pin(M, 0, earIn, -1)];
    const body = k(unite(k, [front, ...rails, ...pins]));
    // as fendas atravessam só os trilhos: a placa da frente termina antes delas
    return slots.length ? k(body.subtract(k(M.Manifold.union(slots.map(k))))).translate([0, 0, 0]) : body.translate([0, 0, 0]);
  });

  const cradle = scoped((k) => {
    const barrel = alongX(k(profile(M, 0, 0, lb - ARM_SLOT, T)), -cradleW / 2, cradleW / 2); // tubo de baixo + a placa do apoio (termina onde começa o rasgo)
    const prongCs = k(profile(M, lb, lb - ARM_SLOT - 0.5, lb, T)); // os braços do apoio ao lado do rasgo; a escora gira entre eles
    const prongs = [alongX(prongCs, cradleIn, cradleW / 2), alongX(prongCs, -cradleW / 2, -cradleIn)];
    const pins = [pin(M, lb, cradleIn, 1), pin(M, lb, cradleIn, -1)];
    const holes = [socket(M, 0, cradleW / 2, 1, c), socket(M, 0, cradleW / 2, -1, c)];
    const withProngs = k(unite(k, [barrel, ...prongs, ...pins]));
    return k(withProngs.subtract(k(M.Manifold.union(holes.map(k))))).translate([0, 0, 0]);
  });

  const strut = scoped((k) => {
    const half2 = strutW / 2;
    const barrel = alongX(k(profile(M, lb, lb, d.barStart + 0.5, T)), -half2, half2); // tubo da escora + a placa
    const bar = box(M, -half, half, d.barStart, lb + d.strutLen, 0, T);
    const holes = [socket(M, lb, half2, 1, c), socket(M, lb, half2, -1, c)];
    return k(k(unite(k, [barrel, bar])).subtract(k(M.Manifold.union(holes.map(k))))).translate([0, 0, 0]);
  });
  return { base, cradle, strut };
}

/** Gira `s` em torno do eixo da dobradiça (altura FOLD_BARREL, em y = `axisY`) por `deg` graus; +: o lado de trás sobe. */
function swingAbout(s: Solid, axisY: number, deg: number): Solid {
  return scoped((k) => k(k(s.translate([0, -axisY, -FOLD_BARREL])).rotate([deg, 0, 0])).translate([0, axisY, FOLD_BARREL]));
}

/** Põe as peças na pose pedida: "print" não mexe; "assembled" abre o apoio no ângulo e apoia a escora; "folded" vira o apoio sobre a base. */
export function foldPose(pieces: Pieces, p: PhoneStandFoldParams, layout: FoldLayout, angle = p.angle): { base: Solid; cradle: Solid; strut: Solid } {
  const { lb } = foldDims(p);
  if (layout === "print") return { base: pieces.base.translate([0, 0, 0]), cradle: pieces.cradle.translate([0, 0, 0]), strut: pieces.strut.translate([0, 0, 0]) };
  const open = layout === "assembled" ? angle : 180;
  const relative = layout === "assembled" ? -2 * angle : 0; // a escora gira o dobro, no sentido contrário, para descer até a base
  return scoped((k) => {
    const strutRel = k(swingAbout(pieces.strut, lb, relative));
    return { base: pieces.base.translate([0, 0, 0]), cradle: swingAbout(pieces.cradle, 0, open), strut: swingAbout(strutRel, 0, open) };
  });
}

/**
 * Suporte de celular dobrável, impresso já montado (print-in-place): a base da frente com dois trilhos, o apoio onde o
 * aparelho encosta e uma escora que cai numa de 3 fendas dos trilhos (as travas de ângulo). As duas dobradiças têm
 * pinos cônicos (sem suporte na impressão) e folga ajustável. O tubo da dobradiça de baixo serve de batente para o
 * aparelho. Imprime aberto e deitado.
 */
export function buildPhoneStandFold(ctx: ModelCtx, p: PhoneStandFoldParams): ModelOutput {
  const { M } = ctx;
  const d = foldDims(p);
  const warnings: string[] = [];
  if (p.clearance < 0.3 || p.clearance > 0.5) warnings.push("Folga fora de 0,3 a 0,5 mm: abaixo disso as peças podem grudar na impressão; acima disso a dobradiça fica frouxa.");
  if (d.flatLength > bedMm() || p.width > bedMm()) warnings.push(`O suporte aberto tem ${Math.round(d.flatLength)} mm de comprimento e não cabe na mesa de ${bedMm()} mm: diminua a altura do apoio ou a base da frente.`);
  if (d.barStart < d.railEnd + 2) warnings.push("A escora fica colada nos trilhos na impressão: aumente a altura do apoio.");
  if (p.layout === "assembled") warnings.push("Esta é só a prévia do suporte montado; para imprimir, volte para \"Para imprimir\".");
  if (p.layout === "folded") warnings.push("Esta é só a prévia do suporte dobrado; para imprimir, volte para \"Para imprimir\".");
  if (p.layout === "print") warnings.push("Imprima como está, sem suporte e sem brim nas dobradiças. Depois de esfriar, dobre e abra cada dobradiça algumas vezes para soltar; se ficar presa, use uma folga maior.");
  warnings.push(`Travas: apoio a ${d.locks.join("°, ")}°. Apoie a escora na fenda do ângulo que quiser.`);
  return scoped((k) => {
    const raw = foldPieces(M, p);
    [raw.base, raw.cradle, raw.strut].forEach(k);
    const posed = foldPose(raw, p, p.layout);
    [posed.base, posed.cradle, posed.strut].forEach(k);
    const parts: Part[] = [
      { name: "Base", color: p.bodyColor, mesh: solidMesh(posed.base) },
      { name: "Apoio", color: p.bodyColor, mesh: solidMesh(posed.cradle) },
      { name: "Escora", color: p.bodyColor, mesh: solidMesh(posed.strut) },
    ];
    const art = ctx.art ?? (p.text.trim() ? ctx.text(p.text, p.textHeight) : null);
    if (art) {
      const own = !ctx.art; // o desenho enviado é de quem chamou: só o texto gerado aqui é apagado
      const w = p.width - 12;
      const h = Math.min(p.textHeight, p.frontLength - FOLD_BARREL - SWING_GAP - 6);
      const fit = k(fitInto(own ? k(art) : art, w, h, 0));
      const placed = k(fit.translate([0, -(p.frontLength + FOLD_BARREL + SWING_GAP) / 2]));
      parts.push({ name: "Texto", color: p.textColor, mesh: slab(placed, p.relief, FOLD_PLATE) });
    }
    const model: Model = { name: "Suporte de celular dobrável", parts };
    return { models: [model], warnings };
  });
}
