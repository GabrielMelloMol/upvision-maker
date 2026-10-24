import * as THREE from "three";
import { loadFont } from "../../geometry/fonts";
import { buildKeychain, DEFAULT_KEYCHAIN } from "../../geometry/keychain";
import { getManifold, type CS } from "../../geometry/manifold";
import { buildMedal, DEFAULT_MEDAL } from "../../geometry/medal";
import { buildThermo, thermoDefaults } from "../../geometry/thermo/build";
import { presetSilhouette, type ThermoShape } from "../../geometry/thermo/shapes";
import { textToCrossSection } from "../../geometry/text";
import type { Model } from "../../geometry/types";
import type { Params } from "../../tools/models/defs";
import { buildModels, showcaseColors } from "../renderThumb";
import { bevelModels } from "./bevel";
import { boundsOf, grounded, placeModels, type Pose } from "./compose";
import { dowelRack, hangingRibbon, hardwareAt, ringAndChain } from "./extras";
import { AZIMUTH_DEG, type PhotoItem, type PhotoScene } from "./render";

/*
 * As cenas da foto realista (#251, rodada 2): cada peça montada como se usa e em 3 a 4 cópias com nomes e cores
 * diferentes, espalhadas na mesa. `bevel` arredonda as quinas (0,4 mm) antes de montar a cena.
 */
export const PHOTO_IDS = ["keychain", "organizer", "medal", "pix", "thermo"] as const;
export type PhotoId = (typeof PHOTO_IDS)[number];
export type SceneOpts = { bevel?: boolean };

const THERMO_TEXT_MM = 42;
const STAND_TILT_DEG = 12; // o mesmo do plateStand (common.ts)
const STAND_SLOT_Z = 4; // fundo do encaixe do suporte: altura 12 − profundidade 8
const MEDAL_SLOT_FROM_TOP = 6; // do topo da alça ao centro do furo da fita

const centered = (cs: CS): CS => {
  const b = cs.bounds();
  return cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
};

/** Peça (já no chão) + adereços na pose da cena. */
type Placed = { item: PhotoItem; extras: THREE.Object3D[] };
function place(models: Model[], extras: THREE.Object3D[], pose: Pose, filament?: PhotoItem["filament"]): Placed {
  const wrapped = extras.map((e) => {
    const holder = new THREE.Group(); // gira em X, depois em Z (mesma ordem de placeModels), depois move
    holder.rotation.set(((pose.rotX ?? 0) * Math.PI) / 180, 0, ((pose.rotZ ?? 0) * Math.PI) / 180, "ZXY");
    holder.position.set(pose.x ?? 0, pose.y ?? 0, pose.z ?? 0);
    holder.add(e);
    return holder;
  });
  return { item: { models: placeModels(models, pose), filament }, extras: wrapped };
}
const sceneOf = (placed: Placed[], more: Partial<PhotoScene> = {}): PhotoScene => ({ items: placed.map((p) => p.item), extras: placed.flatMap((p) => p.extras), hero: 0, ...more }); // a primeira peça é a principal (a da frente)
const maybeBevel = (models: Model[], o: SceneOpts) => (o.bevel ? bevelModels(models) : Promise.resolve(models));

/** Centro do furo da argola: ponto mais à esquerda da base e o seu y (o disco da argola tem o centro a `ringOuter` dele). */
function ringHole(models: Model[], ringOuter: number): THREE.Vector3 {
  const base = models[0].parts.find((p) => p.name === "Base")!.mesh.positions;
  let minX = Infinity;
  for (let i = 0; i < base.length; i += 3) minX = Math.min(minX, base[i]);
  let ys = 0, n = 0;
  for (let i = 0; i < base.length; i += 3) if (base[i] < minX + 0.4) {
      ys += base[i + 1];
      n++;
    }
  return new THREE.Vector3(minX + ringOuter, ys / n, DEFAULT_KEYCHAIN.base / 2);
}

const KEYCHAINS = [
  { name: "Ana", base: "#e8613c", top: "#fff6ea", pose: { x: -2, y: -30, rotZ: -6 }, heading: 188 },
  { name: "Beto", base: "#2563eb", top: "#ffffff", pose: { x: 4, y: -4, rotZ: 6 }, heading: 172 },
  { name: "Clara", base: "#d6338a", top: "#fff0f8", pose: { x: -8, y: 14, rotZ: -4 }, heading: 195 },
  { name: "Duda", base: "#16a34a", top: "#f7fff7", pose: { x: 6, y: 32, rotZ: 8 }, heading: 168 },
];

async function keychains(o: SceneOpts): Promise<PhotoScene> {
  const M = await getManifold();
  const font = await loadFont("hanken");
  const placed: Placed[] = [];
  for (const k of KEYCHAINS) {
    const art = centered(textToCrossSection(M, font, k.name, 14));
    const raw = grounded([buildKeychain(M, art, { ...DEFAULT_KEYCHAIN, baseColor: k.base, topColor: k.top }, k.name)]);
    const hole = ringHole(raw, DEFAULT_KEYCHAIN.ringOuter);
    placed.push(place(await maybeBevel(raw, o), [ringAndChain(hole, k.heading)], k.pose));
  }
  return sceneOf(placed, { view: "top" });
}

const MEDALS = [
  { text: "1º LUGAR", base: "#c48a12", accent: "#ffe9a0", ribbon: "#c81e3a", t: 0 },
  { text: "2º LUGAR", base: "#8f98a6", accent: "#f2f4f8", ribbon: "#1d4ed8", t: -68 },
  { text: "3º LUGAR", base: "#a85f2c", accent: "#f0c9a0", ribbon: "#15803d", t: 68 },
];
const RACK_H = 140; // altura da barra
const RACK_AXIS_DEG = 43; // a barra se afasta um pouco da câmera para a direita
const HANG_MM = 28; // do furo da medalha até o centro da barra
const FACE_DEG = AZIMUTH_DEG; // as medalhas giram para olhar a câmera

/** Medalhas penduradas num cabide de madeira, de frente para a câmera; a dourada no meio. */
async function medals(o: SceneOpts): Promise<PhotoScene> {
  const M = await getManifold();
  const font = await loadFont("hanken");
  const placed: Placed[] = [];
  const extras: THREE.Object3D[] = [dowelRack([0, 0], RACK_AXIS_DEG, 125, RACK_H)];
  const a = (RACK_AXIS_DEG * Math.PI) / 180, f = (FACE_DEG * Math.PI) / 180;
  for (const m of MEDALS) {
    const text = centered(textToCrossSection(M, font, m.text, 8));
    const raw = grounded([buildMedal(M, { ...DEFAULT_MEDAL, diameter: 60, baseColor: m.base, accentColor: m.accent, artColor: m.accent }, null, text)]);
    const b = boundsOf(raw);
    const sx = (b.min[0] + b.max[0]) / 2, sy = b.max[1] - MEDAL_SLOT_FROM_TOP, sz = DEFAULT_MEDAL.thickness / 2;
    // o furo da medalha fica na frente da barra; em pé (rotX 90) e virada para a câmera (rotZ), o furo vai para este ponto
    const slotXY: [number, number] = [Math.cos(a) * m.t + Math.sin(f) * (5 + 0.4), Math.sin(a) * m.t - Math.cos(f) * (5 + 0.4)];
    const off: [number, number] = [sx * Math.cos(f) + sz * Math.sin(f), sx * Math.sin(f) - sz * Math.cos(f)];
    const slotZ = RACK_H - HANG_MM;
    const pose: Pose = { x: slotXY[0] - off[0], y: slotXY[1] - off[1], z: slotZ - sy, rotX: 90, rotZ: FACE_DEG };
    placed.push(place(await maybeBevel(raw, o), [], pose, "silk"));
    extras.push(hangingRibbon(new THREE.Vector3(slotXY[0], slotXY[1], slotZ), RACK_H, DEFAULT_MEDAL.ribbon, m.ribbon, FACE_DEG, RACK_AXIS_DEG));
  }
  return sceneOf(placed, { extras: [...placed.flatMap((p) => p.extras), ...extras], floorZ: 0, heroPad: 0.4 });
}

const PIX = [
  { plate: "#b98f8a", dark: "#3a1f1c", sub: "Clínica Bortolini", pose: { x: 4, y: -22, rotZ: -6 } },
  { plate: "#6f9a7e", dark: "#173424", sub: "Loja da Ana", pose: { x: -62, y: 26, rotZ: 12 } },
  { plate: "#f4f1ea", dark: "#1c1c1e", sub: "Ateliê Mel", pose: { x: 66, y: 20, rotZ: -14 } },
];

/** Placa em pé no suporte inclinado: o eixo da placa vira o do encaixe (90° − inclinação) e a borda de baixo assenta no fundo dele. */
function standPix(models: Model[]): Model[] {
  const plate = models.find((m) => m.name === "Placa Pix")!, stand = models.find((m) => m.name === "Suporte")!;
  const pb = boundsOf([plate]), sb = boundsOf([stand]);
  const h = pb.max[1] - pb.min[1], t = pb.max[2] - pb.min[2];
  const psi = 90 - STAND_TILT_DEG, r = (psi * Math.PI) / 180;
  const yStand = (sb.min[1] + sb.max[1]) / 2;
  const upright = placeModels(placeModels([plate], { z: -t / 2 }), { rotX: psi, y: yStand + (h / 2) * Math.cos(r), z: STAND_SLOT_Z + (h / 2) * Math.sin(r) });
  return [...upright, stand];
}

async function pixPlates(o: SceneOpts): Promise<PhotoScene> {
  const placed: Placed[] = [];
  for (const v of PIX) {
    const models = await buildModels("pix", { plateColor: v.plate, darkColor: v.dark, subtitle: v.sub, name: v.sub, key: "loja@upvision.app", city: "Sao Paulo", title: "PAGUE COM PIX" });
    placed.push(place(await maybeBevel(grounded(standPix(models)), o), [], v.pose));
  }
  return sceneOf(placed, { heroPad: 0.3 });
}

/** Altura do fundo do nicho em (x, y): a face virada para cima mais baixa que cobre esse ponto (o vão do nicho só tem o fundo). */
function floorAt(models: Model[], [x, y]: [number, number]): number {
  let floor = Infinity;
  for (const m of models)
    for (const p of m.parts) {
      const v = p.mesh.positions, ix = p.mesh.indices;
      for (let t = 0; t < ix.length; t += 3) {
        const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
        const area = (v[b] - v[a]) * (v[c + 1] - v[a + 1]) - (v[b + 1] - v[a + 1]) * (v[c] - v[a]); // z da normal: > 0 = virada para cima
        if (area <= 1e-6) continue;
        const w0 = ((v[b] - x) * (v[c + 1] - y) - (v[b + 1] - y) * (v[c] - x)) / area;
        const w1 = ((v[c] - x) * (v[a + 1] - y) - (v[c + 1] - y) * (v[a] - x)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        floor = Math.min(floor, w0 * v[a + 2] + w1 * v[b + 2] + w2 * v[c + 2]);
      }
    }
  return Number.isFinite(floor) ? floor : 2.4;
}

/** Ferragens na mesa, em fração da largura (x) e da profundidade (y, negativo = para a frente da caixa). */
const NICHE_BACK = 0.28; // as ferragens ficam no fundo (lado de trás) do nicho: da câmera alta a parede da frente esconde o centro
const SPILL: [number, number][] = [[0.1, -0.35], [0.2, -0.28], [0.32, -0.42], [0.04, -0.5], [0.42, -0.3], [0.26, -0.55]];

const BOXES: { patch: Params; view: string; pose: Pose }[] = [
  { patch: { boxColor: "#0f9d8a", lidColor: "#fbf3df", decorColor: "#0f9d8a" }, view: "open", pose: { x: 0, y: 0, rotZ: -6 } },
  { patch: { boxColor: "#e8613c", lidColor: "#fff6ea", decorColor: "#e8613c", outerW: 110, outerD: 80, outerH: 32 }, view: "closed", pose: { x: 160, y: -14, rotZ: -10 } },
];

async function organizers(o: SceneOpts): Promise<PhotoScene> {
  const placed: Placed[] = [];
  for (const v of BOXES) {
    const closed = await buildModels("organizerBox", v.patch, "closed");
    const shown = v.view === "open" ? await buildModels("organizerBox", v.patch, "open") : closed;
    const b = boundsOf(closed); // o chão e o centro vêm da caixa fechada: a vista aberta usa as mesmas coordenadas
    const off = { x: -(b.min[0] + b.max[0]) / 2, y: -(b.min[1] + b.max[1]) / 2, z: -b.min[2] };
    const moved = placeModels(shown, off);
    const extras: THREE.Object3D[] = [];
    if (v.view === "open") {
      const W = b.max[0] - b.min[0] - 2 * 2.4, D = b.max[1] - b.min[1] - 2 * 2.4, cols = 5, rows = 4;
      const pts: [number, number][] = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pts.push([-W / 2 + ((c + 0.5) * W) / cols, -D / 2 + ((r + 0.5 + NICHE_BACK) * D) / rows]);
      extras.push(hardwareAt(pts, floorAt(moved, pts[0])));
      // da câmera baixa só se vê o alto dos nichos: parte das ferragens fica caída na mesa, na frente da caixa
      const spill: [number, number][] = SPILL.map(([fx, fy]) => [fx * W, -D / 2 + fy * D]);
      extras.push(hardwareAt(spill, 0));
    }
    placed.push(place(await maybeBevel(moved, o), extras, v.pose));
  }
  return sceneOf(placed, { heroPad: 0.08, elevation: ORGANIZER_ELEVATION_DEG });
}

const THERMOS: { shape: ThermoShape; text: string; sheet: string; design: string; pose: Pose }[] = [
  { shape: "heart", text: "Amor", sheet: "#c0263f", design: "#fff1f3", pose: { x: 0, y: -26, rotZ: -10 } },
  { shape: "heart", text: "Natal", sheet: "#1f7a4d", design: "#f4f4f2", pose: { x: -52, y: 34, rotZ: 14 } },
  { shape: "flower", text: "Mãe", sheet: "#d6338a", design: "#fff0f8", pose: { x: 50, y: 36, rotZ: 6 } },
];

async function thermos(o: SceneOpts): Promise<PhotoScene> {
  const M = await getManifold();
  const font = await loadFont("hanken");
  const placed: Placed[] = [];
  for (const v of THERMOS) {
    const sil = presetSilhouette(M, v.shape, 80);
    const raw = centered(textToCrossSection(M, font, v.text, 12));
    const w = raw.bounds().max[0] * 2;
    const design = w > THERMO_TEXT_MM ? centered(raw.scale(THERMO_TEXT_MM / w)) : raw; // cabe na tela
    const d = thermoDefaults();
    const out = buildThermo(M, sil, design, { ...d, colors: { ...d.colors, sheet: v.sheet, border: v.sheet, clip: v.sheet, design: v.design } });
    placed.push(place(await maybeBevel(grounded([out.assembled]), o), [], v.pose));
  }
  return sceneOf(placed, { view: "top" });
}

export async function photoScene(id: PhotoId, o: SceneOpts = {}): Promise<PhotoScene> {
  switch (id) {
    case "keychain":
      return keychains(o);
    case "organizer":
      return organizers(o);
    case "medal":
      return medals(o);
    case "pix":
      return pixPlates(o);
    case "thermo":
      return thermos(o);
  }
}

const FLAT_RATIO = 0.4; // peça mais baixa que 40% do maior lado da base: deitada na mesa, foto de cima
const LONG_RATIO = 2.5; // peça plana bem mais comprida que larga (régua, corrente): cópias lado a lado pelo lado curto
const LIGHT_LUMA = 0.6; // peça mais clara que isso (luminância linear média): mesa escura, senão some na madeira
const ORGANIZER_ELEVATION_DEG = 62; // mais alto que o padrão: a tampa aberta não esconde o que há atrás
const GENERIC_SPREAD = 1.05; // distância entre cópias, em tamanhos da peça
const TALL_SPREAD = 1.5; // peça em pé: as cópias ficam mais longe, atrás, sem esconder nem cortar a principal
const TALL_PAD = 0.22;
const BIG_FLAT_MM = 120; // peça plana maior que isso e com mais de 40 mm de largura (cartela de kit, placa): sozinha na foto
const BIG_FLAT_SHORT_MM = 40; // a régua (comprida e estreita) continua com cópias: sozinha vira um risco

/** Luminância linear média das cores, pesada pelos triângulos de cada parte (≈ quanto da peça tem aquela cor). */
export function meanLuma(models: Model[]): number {
  let sum = 0, n = 0;
  for (const m of models)
    for (const p of m.parts) {
      const c = new THREE.Color(p.color), t = p.mesh.indices.length / 3;
      sum += (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * t;
      n += t;
    }
  return n ? sum / n : 0;
}

/** Cena genérica de qualquer modelo pronto (miniaturas): a peça e duas cópias nas cores seguintes da vitrine, na mesa. */
export async function genericScene(id: string, o: SceneOpts = {}): Promise<PhotoScene> {
  const base = grounded(await buildModels(id));
  const b = boundsOf(base);
  const w = Math.max(b.max[0] - b.min[0], 1), d = Math.max(b.max[1] - b.min[1], 1);
  const long = Math.max(w, d), short = Math.min(w, d);
  const step = long * GENERIC_SPREAD;
  const variants = [id, `${id}-b`, `${id}-c`].map((alt) => grounded(showcaseColors(alt, base)));
  const flat = b.max[2] - b.min[2] < long * FLAT_RATIO;
  let poses: Pose[] = [{ x: 0, y: -step * 0.3, rotZ: 8 }, { x: -step * 0.62, y: step * 0.5, rotZ: -10 }, { x: step * 0.66, y: step * 0.55, rotZ: 14 }];
  const stretched = flat && long > short * LONG_RATIO;
  if (stretched) {
    // comprida: o lado longo na horizontal da foto e as cópias empilhadas, quase paralelas; a folga cobre o giro
    const turn = d > w ? 90 : 0, gap = short * 1.6 + long * 0.08;
    poses = [{ x: 0, y: -gap, rotZ: turn + 3 }, { x: -long * 0.06, y: 0, rotZ: turn - 2 }, { x: long * 0.05, y: gap, rotZ: turn + 4 }];
  } else if (!flat) {
    const far = long * TALL_SPREAD;
    poses = [{ x: 0, y: 0, rotZ: 8 }, { x: -far * 0.85, y: far * 0.9, rotZ: -10 }, { x: far * 0.9, y: far, rotZ: 14 }];
  }
  if (flat && long > BIG_FLAT_MM && short > BIG_FLAT_SHORT_MM) variants.length = 1; // com cópias ela fica minúscula
  const placed = await Promise.all(variants.map(async (v, i) => place(await maybeBevel(v, o), [], poses[i])));
  const darkTable = meanLuma(variants[0]) > LIGHT_LUMA;
  return sceneOf(placed, flat ? { view: "top", darkTable } : { heroPad: TALL_PAD, darkTable });
}
