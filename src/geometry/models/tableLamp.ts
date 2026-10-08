import type { ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";
import { catmullRom, maxOverhangDeg, MIN_POINTS, parseProfile } from "./vase";

export type ShadeShape = "sphere" | "cylinder" | "cone" | "pear" | "free";
export type ShadeTexture = "none" | "waves" | "facets" | "holes";
export type SocketKind = "E27" | "E14";
export type LampLayout = "assembled" | "print";

export type TableLampParams = {
  shape: ShadeShape;
  profile: string; // "livre": raios (mm) de baixo para cima, 4 a 8 pontos
  diameter: number; // maior diâmetro da cúpula nas formas prontas
  height: number; // altura da cúpula
  wall: number;
  texture: ShadeTexture;
  textureCount: number; // ondas, lados ou furos por fileira
  textureSize: number; // ondas: altura (mm); furos: diâmetro (mm)
  socket: SocketKind;
  socketClearance: number; // folga somada ao diâmetro do soquete (mm)
  socketDepth: number; // quanto do soquete entra na base
  baseDiameter: number;
  baseHeight: number;
  layout: LampLayout; // montada (prévia) ou pronta para imprimir (cúpula de cabeça para baixo ao lado)
  shadeColor: string;
  baseColor: string;
};

export const DEFAULT_TABLE_LAMP: TableLampParams = {
  shape: "pear", profile: "30, 45, 55, 50, 38", diameter: 150, height: 160, wall: 1.2, texture: "none", textureCount: 12, textureSize: 5,
  socket: "E27", socketClearance: 0.4, socketDepth: 32, baseDiameter: 110, baseHeight: 42, layout: "assembled", shadeColor: "#f5f1e6", baseColor: "#2b2b2e",
};

/** Corpo do soquete (diâmetro) e do bulbo de LED comum (raio e faixa de altura do "ventre", contada acima do soquete). */
export const SOCKETS: Record<SocketKind, { body: number; bulbR: number; bulbFrom: number; bulbTo: number }> = {
  E27: { body: 40, bulbR: 30, bulbFrom: 25, bulbTo: 75 },
  E14: { body: 30, bulbR: 17.5, bulbFrom: 15, bulbTo: 45 },
};

const COLLAR_H = 6; // anel da base que entra na cúpula
const COLLAR_WALL = 2;
const FIT = 0.25; // folga entre o anel e a cúpula
const FLOOR = 4.5; // fundo mínimo sob o soquete
const CABLE_W = 7;
const CABLE_H = 4;
const CABLE_HOLE_R = 4;
const TOP_MIN_R = 18; // boca de cima aberta: o calor sai
const BULB_AIR_MM = 8;
const RINGS = 120;
const SEGMENTS = 180;
const MAX_HOLES = 400;
const MAX_OVERHANG_DEG = 60;
const PRESETS: Record<Exclude<ShadeShape, "free">, number[]> = {
  sphere: [0.55, 0.86, 0.98, 1, 0.94, 0.78, 0.5],
  cylinder: [1, 1, 1, 1],
  cone: [1, 0.93, 0.86, 0.79, 0.72, 0.65, 0.58],
  pear: [0.55, 0.78, 0.97, 1, 0.88, 0.68, 0.5],
};

const pocketRadius = (p: TableLampParams) => (SOCKETS[p.socket].body + p.socketClearance) / 2;

/** Raios de controle (mm) da cúpula, de baixo para cima, com o fundo largo o bastante para o anel do soquete. */
export function shadeProfile(p: TableLampParams): number[] {
  const raw = p.shape === "free" ? parseProfile(p.profile) : PRESETS[p.shape].map((f) => (f * p.diameter) / 2);
  if (raw.length < MIN_POINTS) throw new Error(`O perfil precisa de ${MIN_POINTS} a 8 raios, separados por vírgula.`);
  const minBottom = pocketRadius(p) + COLLAR_WALL + FIT + p.wall;
  return raw.map((r, i) => (i === 0 ? Math.max(r, minBottom) : i === raw.length - 1 ? Math.max(r, TOP_MIN_R) : r));
}

/** Fator de "facetas": o lado reto fica no raio do perfil, as quinas um pouco além. */
function facet(sides: number, a: number): number {
  const seg = (2 * Math.PI) / sides;
  const local = (((a % seg) + seg) % seg) - seg / 2;
  return 1 / Math.cos(local);
}

function radiusAt(p: TableLampParams, prof: number[], z: number, a: number): number {
  let r = catmullRom(prof, z);
  if (p.texture === "facets") r *= facet(Math.max(3, Math.round(p.textureCount)), a);
  if (p.texture === "waves") r += (p.textureSize * (Math.sin(Math.max(1, Math.round(p.textureCount)) * a) + 1)) / 2;
  return Math.max(r, TOP_MIN_R);
}

/** Casca de revolução aberta em cima e embaixo, da altura 0 a `height`. */
function shell(M: ManifoldToplevel, p: TableLampParams, prof: number[]): Solid {
  const pos: number[] = [];
  const ring = (j: number, inset: number) => {
    const z = j / RINGS;
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (2 * Math.PI * i) / SEGMENTS;
      const r = radiusAt(p, prof, z, a) - inset;
      pos.push(r * Math.cos(a), r * Math.sin(a), z * p.height);
    }
  };
  for (let j = 0; j <= RINGS; j++) ring(j, 0);
  const innerAt = pos.length / 3;
  for (let j = 0; j <= RINGS; j++) ring(j, p.wall);
  const o = (j: number, i: number) => j * SEGMENTS + (i % SEGMENTS);
  const n = (j: number, i: number) => innerAt + o(j, i);
  const tri: number[] = [];
  for (let j = 0; j < RINGS; j++)
    for (let i = 0; i < SEGMENTS; i++) {
      tri.push(o(j, i), o(j, i + 1), o(j + 1, i + 1), o(j, i), o(j + 1, i + 1), o(j + 1, i)); // fora
      tri.push(n(j, i), n(j + 1, i + 1), n(j, i + 1), n(j, i), n(j + 1, i), n(j + 1, i + 1)); // dentro
    }
  for (let i = 0; i < SEGMENTS; i++) {
    tri.push(o(0, i), n(0, i), n(0, i + 1), o(0, i), n(0, i + 1), o(0, i + 1)); // borda de baixo
    tri.push(o(RINGS, i), o(RINGS, i + 1), n(RINGS, i + 1), o(RINGS, i), n(RINGS, i + 1), n(RINGS, i)); // borda de cima
  }
  return M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: new Float32Array(pos), triVerts: new Uint32Array(tri) }));
}

/** Furos redondos em fileiras alternadas, atravessando a parede. */
function holes(M: ManifoldToplevel, p: TableLampParams, prof: number[]): Solid[] {
  const d = Math.max(2, p.textureSize);
  const perRow = Math.max(3, Math.round(p.textureCount));
  const rows = Math.max(1, Math.min(Math.floor((MAX_HOLES / perRow)), Math.floor((p.height * 0.6) / (d * 2))));
  const reach = Math.max(...prof) * 1.3 + 10;
  const out: Solid[] = [];
  for (let r = 0; r < rows; r++) {
    const z = p.height * (0.2 + 0.65 * (rows === 1 ? 0.5 : r / (rows - 1)));
    for (let i = 0; i < perRow; i++) {
      const a = ((i + (r % 2) / 2) * 360) / perRow;
      const c = M.Manifold.cylinder(reach, d / 2, d / 2, 16, false);
      const tilted = c.rotate([0, 90, 0]);
      const placed = tilted.translate([0, 0, z]).rotate([0, 0, a]);
      c.delete();
      tilted.delete();
      out.push(placed);
    }
  }
  return out;
}

/** Pedestal cônico com anel de encaixe, bolso do soquete, canal e furo do cabo. Origem no centro, apoiado na mesa. */
function baseSolid(M: ManifoldToplevel, p: TableLampParams, shadeBottomOuter: number, shadeBottomInner: number, k: (s: Solid) => Solid): Solid {
  const pocketR = pocketRadius(p);
  const baseR = Math.max(p.baseDiameter / 2, shadeBottomOuter + 6);
  const pocketBottom = p.baseHeight + COLLAR_H - p.socketDepth;
  const body = k(M.Manifold.cylinder(p.baseHeight, baseR, shadeBottomOuter, SEGMENTS, false));
  const collar = k(k(M.Manifold.cylinder(COLLAR_H + 0.01, shadeBottomInner - FIT, shadeBottomInner - FIT, SEGMENTS, false)).translate([0, 0, p.baseHeight - 0.01]));
  const pocket = k(k(M.Manifold.cylinder(p.socketDepth + 1, pocketR, pocketR, 64, false)).translate([0, 0, pocketBottom]));
  const groove = k(M.Manifold.cube([baseR + 2, CABLE_W, CABLE_H], false).translate([0, -CABLE_W / 2, -0.01]));
  const hole = k(M.Manifold.cylinder(pocketBottom + 1, CABLE_HOLE_R, CABLE_HOLE_R, 24, false));
  const solid = k(k(body.add(collar)).subtract(k(k(pocket.add(groove)).add(hole))));
  return solid;
}

/**
 * Luminária de mesa por revolução: cúpula pelo perfil do vaso (formas prontas ou raios livres) com ondas, facetas ou
 * furos, e base com bolso para o soquete E27 ou E14, canal e furo para o cabo. Prévia montada ou pronta para imprimir.
 */
export function buildTableLamp({ M }: ModelCtx, p: TableLampParams): ModelOutput {
  const prof = shadeProfile(p);
  const pocketBottom = p.baseHeight + COLLAR_H - p.socketDepth;
  if (pocketBottom < FLOOR) throw new Error(`Base baixa demais para o soquete: use altura de ${Math.ceil(p.socketDepth - COLLAR_H + FLOOR)} mm ou mais, ou entre menos soquete.`);
  return scoped((k) => {
    let shade = k(shell(M, p, prof));
    if (p.texture === "holes") {
      const cutters = holes(M, p, prof);
      const all = k(M.Manifold.union(cutters));
      cutters.forEach((c) => c.delete());
      shade = k(shade.subtract(all));
    }
    const bottomOuter = radiusAt({ ...p, texture: "none" }, prof, 0, 0);
    const base = baseSolid(M, p, bottomOuter, bottomOuter - p.wall, k);
    const baseMesh = solidMesh(base);
    const b = base.boundingBox();
    const baseR = b.max[0];
    const shadeMax = Math.max(...Array.from({ length: 24 }, (_, i) => radiusAt(p, prof, i / 23, 0)));
    const assembled = p.layout === "assembled";
    const placedShade = assembled
      ? k(shade.translate([0, 0, p.baseHeight]))
      : k(k(k(shade.rotate([180, 0, 0])).translate([0, 0, p.height])).translate([baseR + shadeMax + 10, 0, 0]));
    const shadeMesh = solidMesh(placedShade);

    const warnings = ["Use só lâmpada LED de até 9 W. Incandescente e halógena esquentam demais e deformam o plástico (o PLA amolece perto de 55 °C). Soquete e cabo precisam ser certificados."];
    const sock = SOCKETS[p.socket];
    const gapAt = (zFrac: number) => catmullRom(prof, zFrac) - p.wall - sock.bulbR;
    const from = (COLLAR_H + sock.bulbFrom) / p.height, to = Math.min(1, (COLLAR_H + sock.bulbTo) / p.height);
    let tightest = Infinity;
    for (let i = 0; i <= 20 && from < 1; i++) tightest = Math.min(tightest, gapAt(from + ((to - from) * i) / 20));
    if (tightest < BULB_AIR_MM) warnings.push(`A cúpula chega a ${Math.max(0, Math.round(tightest))} mm da lâmpada ${p.socket}: deixe pelo menos ${BULB_AIR_MM} mm de folga ou use uma lâmpada menor.`);
    const up = maxOverhangDeg(prof, p.height), down = maxOverhangDeg([...prof].reverse(), p.height);
    const [worst, other] = assembled ? [up, down] : [down, up];
    if (worst > MAX_OVERHANG_DEG && other > MAX_OVERHANG_DEG) warnings.push(`O perfil tem balanço de mais de ${MAX_OVERHANG_DEG}° nos dois sentidos: suavize o ponto que abre de repente.`);
    else if (worst > MAX_OVERHANG_DEG) warnings.push(assembled ? `A cúpula abre ${Math.round(worst)}° na subida: para imprimir, troque a disposição para "Pronta para imprimir" (ela vira de cabeça para baixo).` : `De cabeça para baixo a cúpula abre ${Math.round(worst)}°: suavize o perfil.`);

    return {
      models: [{ name: "Luminária", parts: [{ name: "Base", color: p.baseColor, mesh: baseMesh }, { name: "Cúpula", color: p.shadeColor, mesh: shadeMesh }] }],
      warnings,
    };
  });
}

