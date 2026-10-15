import { readFileSync } from "node:fs";
import { join } from "node:path";
import { qrMatrix } from "../domain/qr";
import { splitByColor } from "../geometry/colorSplit";
import { buildCutter, DEFAULT_CUTTER, type CutterParams } from "../geometry/cutter";
import { extrudeDesign } from "../geometry/extrude";
import { loadFont } from "../geometry/fonts";
import { toMesh } from "../geometry/mesh";
import { planarFaces, readOwnFile } from "../geometry/ownModel";
import { applyOwnDecals } from "../tools/models/applyOwn";
import { newTextLayer } from "../tools/models/layers";
import { composeKeychainArt } from "../geometry/keychainArt";
import { buildKeychain, DEFAULT_KEYCHAIN, layoutOnPlate, type KeychainParams } from "../geometry/keychain";
import { buildLayeredPicture, DEFAULT_LAYERED, type LayeredParams } from "../geometry/layeredPicture";
import { DEFAULT_LITHO, type LithoParams } from "../geometry/lithophane";
import { buildColorLithophane, DEFAULT_COLOR_LITHO, type ColorLithoParams } from "../geometry/lithophaneColor";
import { buildRelief, DEFAULT_RELIEF, type ReliefParams } from "../geometry/relief";
import { buildLithophaneSet, lithoGrid } from "../geometry/lithophaneSet";
import { fitAspect } from "../geometry/lithophaneShapes";
import type { CS, ManifoldToplevel } from "../geometry/manifold";
import { buildMedalDesign, DEFAULT_MEDAL_DESIGN, type MedalDesign } from "../geometry/medalDesign";
import { runCuts, type CutItem } from "../geometry/cutSequence";
import { suggestCuts } from "../geometry/cutSuggest";
import { partialCut, DEFAULT_PARTIAL_CUT, type PartialCutOptions } from "../geometry/partialCut";
import { cutModels, DEFAULT_CUT } from "../geometry/planeCut";
import { COLOR_LITHO_PROFILE, CUTTER_PROFILE, DEFAULT_PROFILE, STAMP_HINGE_PROFILE, STAMP_PROFILE, THERMO_MOLD_PROFILE, THERMO_SCREEN_PROFILE, INVITE_CARD_PROFILE, INVITE_LACE_PROFILE, INVITE_PIECES_PROFILE, LAYERED_PROFILE, LITHO_PROFILE, RELIEF_PROFILE, type PrintProfile } from "../geometry/printProfile";
import { qrModel, type QrStyle } from "../geometry/qr3d";
import { buildStamp, DEFAULT_STAMP, type StampParams } from "../geometry/stamp";
import { buildInvite, DEFAULT_INVITE, PALETTES, type InviteParams } from "../geometry/invite/build";
import { DEFAULT_ENVELOPE, type EnvelopeParams } from "../geometry/invite/envelope";
import { buildThermo, DEFAULT_THERMO, type ThermoParams } from "../geometry/thermo/build";
import { presetSilhouette, type ThermoShape } from "../geometry/thermo/shapes";
import { buildStampArt, DEFAULT_ART, fixThinStrokes, type StampArtInput } from "../geometry/stampArt";
import { buildSpoolTag, spoolTagsThatFit } from "../geometry/spoolTag";
import { arcTextToCrossSection, textToCrossSection } from "../geometry/text";
import { read3mf } from "../geometry/threemfRead";
import type { Model } from "../geometry/types";
import { bedWarnings } from "../tools/models/bedCheck";
import { testArt, type QaCase } from "./cases";
import { drawerCases } from "./drawerCases";
import { toolFitCases } from "./toolFitCases";

/**
 * Ferramentas avulsas (fora dos Modelos prontos) na varredura (#90): mesma geometria que a tela chama, com os limites
 * dos campos de cada tela (mínimo/máximo). Imagem → SVG não entra: não exporta 3D.
 */
type Out = { models: Model[]; pauses?: number[]; warnings?: string[] };
type Variant = [string, () => Out | Promise<Out>, PrintProfile?];

const PLATE_MM = 256;
const GAP_MM = 4;
const MAX_COLS = 400; // como a Litofania: limita o detalhe
const FIXTURE = join(__dirname, "../../tests/fixtures/3mf/cubo-pintado-bambu.3mf");
const CHARACTER = join(__dirname, "../../tests/fixtures/stl/personagem-arvore.stl");
const ARM = join(__dirname, "../../tests/fixtures/stl/boneco-braco.stl");

const cases = (id: string, label: string, list: Variant[]): QaCase[] =>
  list.map(([variant, run, profile]) => ({
    key: `${id}:${variant}`,
    owner: "Forja",
    group: "tools",
    label: `${label} (ferramenta)`,
    variant,
    profile: profile ?? DEFAULT_PROFILE,
    build: async () => {
      const o = await run();
      return { models: o.models, pauses: o.pauses ?? [], warnings: o.warnings ?? [] };
    },
  }));

/** Desenho de teste na largura pedida (como o designFromSvg da tela). */
function artAt(M: ManifoldToplevel, width: number): CS {
  const a = testArt(M);
  const b = a.bounds();
  return a.scale(width / (b.max[0] - b.min[0]));
}

/** Foto sintética: degradê com um disco claro (tons do preto ao branco). */
function photo(width: number, cell: number) {
  const step = Math.max(cell, width / MAX_COLS);
  const cols = Math.round(width / step) + 1;
  const rows = Math.round(cols * 0.75);
  const luma = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const d = Math.hypot(c - cols / 2, r - rows / 2) / (rows / 2);
      luma[r * cols + c] = Math.min(1, Math.max(0, 0.6 * (c / cols) + (d < 0.5 ? 0.4 : 0)));
    }
  return { luma, cols, rows, step };
}

/** Foto sintética de `cols` pontos de largura (4:3). */
function photoGrid(cols: number) {
  const rows = Math.round(cols * 0.75);
  const luma = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const d = Math.hypot(c - cols / 2, r - rows / 2) / (rows / 2);
      luma[r * cols + c] = Math.min(1, Math.max(0, 0.6 * (c / cols) + (d < 0.5 ? 0.4 : 0)));
    }
  return { luma, w: cols, h: rows };
}

/** Foto colorida sintética (4:3): céu azul, sol amarelo, chão verde e uma faixa vermelha. */
function colorPhoto(cols: number) {
  const rows = Math.round(cols * 0.75);
  const rgba = new Uint8ClampedArray(cols * rows * 4);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const sun = Math.hypot(c - cols * 0.7, r - rows * 0.3) < rows * 0.15;
      const px = sun ? [255, 214, 40] : r > rows * 0.7 ? [70, 150, 70] : c < cols * 0.15 ? [210, 50, 50] : [90 + (r / rows) * 100, 150 + (r / rows) * 80, 235];
      rgba.set([...px, 255], (r * cols + c) * 4);
    }
  return { rgba, w: cols, h: rows };
}

export function toolCases(M: ManifoldToplevel): QaCase[] {
  const keychain = async (textH: number, patch: Partial<KeychainParams>, names = ["Ana"]): Promise<Out> => {
    const f = await loadFont("pacifico");
    const p = { ...DEFAULT_KEYCHAIN, ...patch };
    const built = names.map((n) => buildKeychain(M, textToCrossSection(M, f, n, textH), p, n));
    return { models: built.length > 1 ? layoutOnPlate(built, PLATE_MM - 2 * GAP_MM, GAP_MM) : built };
  };

  // arte girada e deslocada à mão (#183): o logo (a arte de teste, centrada) gira 30° e sobe 4 mm
  const keychainArt = async (): Promise<Out> => {
    const f = await loadFont("pacifico");
    const art = artAt(M, 16);
    const b = art.bounds();
    const centered = art.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
    const text = textToCrossSection(M, f, "Ana", 14);
    const c = composeKeychainArt((cs) => cs, { text, logo: centered, layers: null, move: { rot: 30, dx: 0, dy: 4 }, silhouette: false });
    return { models: [buildKeychain(M, c.art, DEFAULT_KEYCHAIN, "Ana")] };
  };

  // decal embutido na lateral de um bloco próprio (#113): a cor ocupa o material tirado
  const ownDecal = async (mode: "inlay" | "raised"): Promise<Out> => {
    const block: Model = { name: "Bloco", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(M.Manifold.cube([60, 40, 30], false)) }] };
    const side = planarFaces(block).find((f) => f.normal[0] === 1)!;
    const layer = { ...newTextLayer(null, "hanken", "#d6262e", mode), text: "Ana", x: 0, y: 0, width: 30 };
    const out = await applyOwnDecals(block, side, [layer], M);
    return { models: out.models, warnings: out.warnings };
  };

  const medal = async (patch: Partial<MedalDesign>): Promise<Out> => {
    const f = await loadFont("hanken");
    const warnings: string[] = [];
    const ctx = { M, art: null, artLayers: null, warn: (m: string) => void warnings.push(m), text: (s: string, h: number) => textToCrossSection(M, f, s, h), arc: (s: string, h: number, r: number, side: "top" | "bottom") => arcTextToCrossSection(M, f, s, h, r, side) };
    return { models: buildMedalDesign(ctx, { ...DEFAULT_MEDAL_DESIGN, ...patch }), warnings };
  };
  // como a tela do Carimbo seco: arte com texto (e logo de teste), traço fino engrossado, só as placas vão para o arquivo
  const stamp = async (patch: Partial<StampParams>, art: Partial<StampArtInput> = {}, logo = false): Promise<Out> => {
    const font = await loadFont("pacifico");
    const p = { ...DEFAULT_STAMP, ...patch };
    const made = buildStampArt(M, { shape: p.shape, w: p.w, h: p.shape === "round" ? p.w : p.h, logo: logo ? artAt(M, 30) : null, lines: ["Ana & Bruno"], font, ...DEFAULT_ART, ...art });
    const thin = fixThinStrokes(M, made.art, true);
    const out = buildStamp(M, thin.cs, p);
    const models = out.models.filter((m) => !m.previewOnly);
    return { models, warnings: [...made.warnings, ...out.warnings, ...bedWarnings(models, out.warnings)] };
  };
  // como a tela do Convite envelope: o envelope (com a pausa do tule), o cartão transparente e as peças em relevo, cada um num arquivo
  const invite = async (part: "envelope" | "card" | "pieces", env: Partial<EnvelopeParams> = {}, rest: Partial<InviteParams> = {}, text?: Partial<import("../geometry/invite/card").CardText>): Promise<Out> => {
    const fonts = { name: await loadFont("playfair"), text: await loadFont("montserrat") };
    const p: InviteParams = { ...DEFAULT_INVITE, ...rest, env: { ...DEFAULT_ENVELOPE, ...env } };
    const out = buildInvite(M, p, PALETTES[0].colors, { name: "Amanda", title: "XV anos", phrase: "Uma noite cheia de glamour,\nbrilho e a minha ilustre presença", date: "06.12.26", place: "Palácio dos Lírios", ...text }, fonts, null);
    const models = part === "envelope" ? [out.envelope] : part === "card" ? [out.card] : out.pieces;
    return { models, pauses: part === "envelope" ? out.pauses : [], warnings: [...out.warnings, ...bedWarnings(models, out.warnings)] };
  };
  // como a tela da Caixinha termoformada: silhueta pronta, texto de cima, as telas (PLA) e o molde (PETG) em arquivos separados
  const thermo = async (part: "screens" | "mold", shape: ThermoShape, width: number, patch: Partial<ThermoParams> = {}): Promise<Out> => {
    const font = await loadFont("pacifico");
    const sil = presetSilhouette(M, shape, width);
    try {
      const art = buildStampArt(M, { shape: "rect", w: width * 0.6, h: width * 0.4, logo: null, lines: ["Feliz Natal"], font, ...DEFAULT_ART }).art;
      try {
        const out = buildThermo(M, sil, art, { ...DEFAULT_THERMO, ...patch });
        const models = part === "screens" ? out.screens : [out.mold];
        return { models, warnings: [...out.warnings, ...bedWarnings(models, out.warnings)] };
      } finally {
        art.delete();
      }
    } finally {
      sil.delete();
    }
  };
  const medalSizes = (v: number) => ({ topSize: v, centerSize: v, rankSize: v, dateSize: v, bottomSize: v });

  // como a tela: grade e recorte por formato, peça mais base de LED e tampas, aviso de mesa junto
  const litho = (width: number, cell: number, patch: Partial<LithoParams>): Out => {
    const p = { ...DEFAULT_LITHO, ...patch };
    const grid = lithoGrid(p, width, cell);
    const ph = photoGrid(grid.cols);
    const fit = grid.aspect ? fitAspect(ph.luma, ph.w, ph.h, grid.aspect) : ph;
    const set = buildLithophaneSet(M, fit.luma, fit.w, fit.h, grid.step, p);
    return { models: set.models, warnings: [...set.warnings, ...bedWarnings(set.models, set.warnings)] };
  };
  const relief = (width: number, cell: number, patch: Partial<ReliefParams>, subject = false): Out => {
    const grid = lithoGrid({ ...DEFAULT_LITHO, shape: "flat" }, width, cell);
    const ph = photoGrid(grid.cols);
    const mask = subject ? Uint8Array.from({ length: ph.w * ph.h }, (_, i) => (Math.hypot((i % ph.w) - ph.w / 2, Math.floor(i / ph.w) - ph.h / 2) < ph.h * 0.35 ? 1 : 0)) : null;
    const model = buildRelief(ph.luma, ph.w, ph.h, grid.step, { ...DEFAULT_RELIEF, ...patch }, mask);
    return { models: [model], warnings: bedWarnings([model], []) };
  };
  const colorLitho = (width: number, cell: number, patch: Partial<ColorLithoParams>): Out => {
    const grid = lithoGrid({ ...DEFAULT_LITHO, shape: "flat" }, width, cell);
    const ph = colorPhoto(grid.cols);
    const out = buildColorLithophane(M, ph.rgba, ph.w, ph.h, grid.step, { ...DEFAULT_COLOR_LITHO, ...patch });
    return { models: [out.model], warnings: [...out.warnings, ...bedWarnings([out.model], [])] };
  };
  const layered = (width: number, cell: number, patch: Partial<LayeredParams>): Out => {
    const ph = photo(width, cell);
    const out = buildLayeredPicture(M, ph.luma, ph.cols, ph.rows, ph.step, { ...DEFAULT_LAYERED, ...patch });
    return { models: [out.model], pauses: out.swaps.map((s) => s.z) };
  };

  // como as telas (#122): o aviso de mesa vem junto
  const cutter = (width: number, patch: Partial<CutterParams>): Out => {
    const out = buildCutter(M, artAt(M, width), { ...DEFAULT_CUTTER, ...patch });
    return { ...out, warnings: [...out.warnings, ...bedWarnings(out.models, out.warnings)] };
  };
  const extrude = (width: number, height: number, base: { margin: number; thickness: number } | null): Out => {
    const models = [extrudeDesign(M, artAt(M, width), { height, base })];
    return { models, warnings: bedWarnings(models, []) };
  };

  const qr = (p: { size: number; base: number; relief: number; quiet: number; corner: number; style?: QrStyle; steps?: number }): Out => {
    const r = qrModel(M, qrMatrix("https://upvision.app/qa"), { sizeMm: p.size, baseMm: p.base, reliefMm: p.relief, quiet: p.quiet, cornerMm: p.corner, style: p.style, steps: p.steps, seed: 3 }, "QR Code");
    return { models: [r.model], warnings: r.warnings };
  };

  const spool = async (n: number): Promise<Out> => {
    const f = await loadFont("hanken");
    const text = (s: string, h: number) => (s.trim() ? textToCrossSection(M, f, s, h) : null);
    const tags = Array.from({ length: n }, (_, i) => buildSpoolTag(M, text, { id: i + 1, title: `PLA Basic ${i + 1}`, color: "#2563eb" }));
    return { models: tags.length > 1 ? layoutOnPlate(tags, PLATE_MM - 2 * GAP_MM, GAP_MM) : tags };
  };

  const split = (depth: number, cut: boolean): Out => {
    const out = splitByColor(M, read3mf(new Uint8Array(readFileSync(FIXTURE))), { depth, mode: "parts" });
    if (!cut) return out;
    const c = cutModels(M, out.models, DEFAULT_CUT);
    return { models: c.models, warnings: [...out.warnings, ...c.warnings] };
  };

  // corte parcial: "personagem + árvore" (dois blocos separados), corta só o topo do primeiro
  const partial = (patch: Partial<PartialCutOptions>): Out => {
    const scene: Model = { name: "Cena", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(M.Manifold.union([M.Manifold.cube([20, 20, 40]), M.Manifold.cube([20, 20, 40]).translate([40, 0, 0])])) }] };
    const o = partialCut(M, scene, { ...DEFAULT_PARTIAL_CUT, offset: 30, region: { kind: "box", min: [-5, -5, 20], max: [25, 25, 50] }, ...patch });
    return { models: o.models, warnings: o.warnings };
  };

  // dois cortes em sequência, cada pedaço numa cor (cada cor = um filamento no 3MF)
  const twoCuts = (colors: boolean): Out => {
    const scene: Model = { name: "Cena", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(M.Manifold.union([M.Manifold.cube([20, 20, 40]), M.Manifold.cube([20, 20, 40]).translate([40, 0, 0])])) }] };
    const cut = (x0: number, x1: number, color: string | null): CutItem => ({ ...DEFAULT_PARTIAL_CUT, offset: 30, region: { kind: "box", min: [x0, -5, 20], max: [x1, 25, 50] }, color });
    const o = runCuts(M, scene, { cuts: [cut(-5, 25, colors ? "#d6262e" : null), cut(35, 65, colors ? "#2563eb" : null)], restColor: colors ? "#f4f4f2" : null });
    return { models: o.models, warnings: o.warnings };
  };

  return [
    ...cases("partialcut", "Corte parcial", [
      ["sugestão para menos suporte", (): Out => {
        const model = readOwnFile(new Uint8Array(readFileSync(ARM)), "boneco-braco.stl");
        const [s] = suggestCuts(M, model);
        const o = runCuts(M, model, { cuts: [{ ...DEFAULT_PARTIAL_CUT, offset: s.z, region: { kind: "box", ...s.region }, color: null }], restColor: null });
        return { models: o.models, warnings: o.warnings };
      }],
      ["dois cortes", () => twoCuts(false)],
      ["dois cortes em cores", () => twoCuts(true)],
      ["padrão", () => partial({})],
      ["pino fixo", () => partial({ mode: "fixed", pin: "square" })],
      ["inclinado", () => partial({ tilt: 30, offset: 28, region: { kind: "box", min: [-5, -5, 0], max: [25, 25, 50] } })],
      ["sem encaixe", () => partial({ pin: "none" })],
      ["cilindro", () => partial({ region: { kind: "cylinder", center: [10, 10, 35], radius: 12, height: 30, axis: "z" } })],
      ["esfera", () => partial({ region: { kind: "sphere", center: [10, 10, 33], radius: 9 } })],
      ["personagem e árvore", (): Out => {
        const model = readOwnFile(new Uint8Array(readFileSync(CHARACTER)), "personagem-arvore.stl");
        const o = partialCut(M, model, { ...DEFAULT_PARTIAL_CUT, offset: 31, region: { kind: "box", min: [-4, -9, 24], max: [20, 21, 60] } });
        return { models: o.models, warnings: o.warnings };
      }],
    ]),
    ...cases("keychain", "Chaveiro", [
      ["padrão", () => keychain(14, {})],
      ["mínimo", () => keychain(5, { base: 0.8, relief: 0.4, border: 1 })],
      ["máximo", () => keychain(60, { base: 8, relief: 5, border: 10 })],
      ["etiqueta", () => keychain(14, { shape: "rect", rectWidth: 30 })],
      ["3 camadas", () => keychain(14, { layers: 3 })],
      ["arte girada", () => keychainArt()],
      ["lote 30", () => keychain(14, {}, Array.from({ length: 30 }, (_, i) => `Nome ${i + 1}`))],
    ]),
    ...cases("ownDecal", "Decal em modelo próprio", [
      ["embutido", () => ownDecal("inlay")],
      ["relevo", () => ownDecal("raised")],
    ]),
    ...cases("medal", "Medalha", [
      ["padrão", () => medal({})],
      ["mínimo", () => medal({ diameter: 25, thickness: 1.5, rim: 0, relief: 0.4, arcInset: 0, backSize: 2, ...medalSizes(2) })],
      ["máximo", () => medal({ diameter: 150, thickness: 10, rim: 12, relief: 5, arcInset: 10, backSize: 20, ...medalSizes(24) })],
    ]),
    ...cases("stamp", "Carimbo seco", [
      ["padrão", () => stamp({}), STAMP_PROFILE],
      ["mínimo", () => stamp({ w: 15, h: 10, edge: 6, plate: 3, relief: 0.4, draft: 0, paper: 0.2 }, { lines: ["A"] }), STAMP_PROFILE],
      ["máximo", () => stamp({ w: 100, h: 100, plate: 8, relief: 3, draft: 20, paper: 2 }), STAMP_PROFILE],
      ["selo com texto em volta", () => stamp({ shape: "round", w: 45, h: 45 }, { frame: "seal", arcTop: "ANA & BRUNO", arcBottom: "12.10.2027", lines: ["A & B"] }), STAMP_PROFILE],
      ["ímãs (2)", () => stamp({ align: "magnets" }, { frame: "line" }), STAMP_PROFILE],
      ["ímãs (4) no redondo", () => stamp({ align: "magnets", magCount: 4, shape: "round", w: 40, h: 40 }), STAMP_PROFILE],
      ["dobradiça", () => stamp({ align: "hinge", w: 50, h: 60 }, { frame: "line", lines: ["EX LIBRIS", "Maria"] }), STAMP_HINGE_PROFILE],
      ["logo e texto", () => stamp({ w: 60, h: 60 }, { layout: "stack" }, true), STAMP_PROFILE],
    ]),
    ...cases("inviteEnvelope", "Convite envelope: envelope", [
      ["flores com tule (pausa)", () => invite("envelope"), INVITE_LACE_PROFILE],
      ["abas arredondadas", () => invite("envelope", { flap: "round" }), INVITE_LACE_PROFILE],
      ["dobra só no tule", () => invite("envelope", { hinge: "tulle" }), INVITE_LACE_PROFILE],
      ["arabescos 2 tons", () => invite("envelope", { pattern: "arabesque" }, { tones: 2 }), INVITE_LACE_PROFILE],
      ["borboletas e asas levantadas", () => invite("envelope", { pattern: "butterflies" }, { butterfly: "wings" }), INVITE_LACE_PROFILE],
      ["folhagem sem tule", () => invite("envelope", { pattern: "leaves", tulle: false }), INVITE_LACE_PROFILE],
      ["mínimo", () => invite("envelope", { w: 70, h: 50, frame: 2, gap: 1, thickness: 0.8, tuleAt: 0.4 }), INVITE_LACE_PROFILE],
      ["máximo", () => invite("envelope", { w: 200, h: 160, frame: 8, gap: 4, thickness: 2.4, tuleAt: 2 }), INVITE_LACE_PROFILE],
    ]),
    ...cases("inviteCard", "Convite envelope: cartão", [
      ["relevo", () => invite("card"), INVITE_CARD_PROFILE],
      ["embutido", () => invite("card", {}, { card: { ...DEFAULT_INVITE.card, style: "inlay" } }), INVITE_CARD_PROFILE],
      ["mínimo", () => invite("card", { w: 70, h: 50, frame: 2 }, {}, { phrase: "", place: "" }), INVITE_CARD_PROFILE],
      ["texto longo", () => invite("card", {}, {}, { name: "Maria Eduarda & João Pedro", phrase: "Convidamos você e toda a sua família\npara celebrar conosco este dia\ntão especial das nossas vidas" }), INVITE_CARD_PROFILE],
    ]),
    ...cases("invitePieces", "Convite envelope: borboleta e flores", [
      ["padrão", () => invite("pieces"), INVITE_PIECES_PROFILE],
      ["máximo", () => invite("pieces", {}, { pieces: { butterflies: 4, butterflySpan: 80, flowers: 6, flowerR: 24 } }), INVITE_PIECES_PROFILE],
    ]),
    ...cases("thermoScreens", "Caixinha termoformada: telas", [
      ["coração", () => thermo("screens", "heart", 70), THERMO_SCREEN_PROFILE],
      ["estrela", () => thermo("screens", "star", 70), THERMO_SCREEN_PROFILE],
      ["flor", () => thermo("screens", "flower", 70), THERMO_SCREEN_PROFILE],
      ["círculo losango", () => thermo("screens", "circle", 60, { screen: { ...DEFAULT_THERMO.screen, mesh: "diamond" } }), THERMO_SCREEN_PROFILE],
      ["bola de Natal com faixa", () => thermo("screens", "ball", 70, { screen: { ...DEFAULT_THERMO.screen, closure: "ring" } }), THERMO_SCREEN_PROFILE],
      ["mínimo", () => thermo("screens", "square", 40, { screen: { ...DEFAULT_THERMO.screen, t: 0.6, border: 2, aperture: 2, wire: 0.6 } }), THERMO_SCREEN_PROFILE],
      ["máximo", () => thermo("screens", "egg", 100, { screen: { ...DEFAULT_THERMO.screen, t: 2, border: 8, aperture: 8, wire: 2 } }), THERMO_SCREEN_PROFILE],
    ]),
    ...cases("thermoMold", "Caixinha termoformada: molde", [
      ["coração", () => thermo("mold", "heart", 70), THERMO_MOLD_PROFILE],
      ["estrela", () => thermo("mold", "star", 70), THERMO_MOLD_PROFILE],
      ["flor", () => thermo("mold", "flower", 70), THERMO_MOLD_PROFILE],
      ["bola de Natal", () => thermo("mold", "ball", 70), THERMO_MOLD_PROFILE],
      ["maciço", () => thermo("mold", "circle", 60, { mold: { ...DEFAULT_THERMO.mold, hollow: false } }), THERMO_MOLD_PROFILE],
      // referência: o molde de domo maciço, 8% e 100% de preenchimento (o que se imprimiria sem a casca oca)
      ["coração maciço 8%", () => thermo("mold", "heart", 70, { mold: { ...DEFAULT_THERMO.mold, hollow: false } }), THERMO_MOLD_PROFILE],
      ["coração maciço 100%", () => thermo("mold", "heart", 70, { mold: { ...DEFAULT_THERMO.mold, hollow: false } }), { ...THERMO_MOLD_PROFILE, infill: 100 }],
      ["mínimo", () => thermo("mold", "square", 40, { domeH: 6 }), THERMO_MOLD_PROFILE],
      ["máximo", () => thermo("mold", "egg", 130, { domeH: 40 }), THERMO_MOLD_PROFILE],
    ]),
    ...cases("lithophane", "Litofania", [
      ["padrão", () => litho(100, 0.3, {}), LITHO_PROFILE],
      ["mínimo", () => litho(20, 0.15, { minT: 0.4, maxT: 1, border: 0, arc: 30 }), LITHO_PROFILE],
      ["máximo", () => litho(250, 1, { minT: 3, maxT: 8, border: 15, arc: 270 }), LITHO_PROFILE],
      ["curva", () => litho(100, 0.3, { shape: "curved" }), LITHO_PROFILE],
      ["caixa", () => litho(100, 0.3, { shape: "box" }), LITHO_PROFILE],
      // #101: cilindro, coração, círculo e a base de LED (disco ou fita, cabo ou pilhas)
      ["cilindro", () => litho(100, 0.3, { shape: "cylinder" }), LITHO_PROFILE],
      ["cilindro mínimo", () => litho(100, 0.15, { shape: "cylinder", diameter: 30, height: 30, minT: 0.4, maxT: 1, border: 0 }), LITHO_PROFILE],
      ["cilindro máximo", () => litho(100, 1, { shape: "cylinder", diameter: 150, height: 200, minT: 3, maxT: 8, border: 15, lid: true, led: { kind: "disc", size: 120, power: "battery" } }), LITHO_PROFILE],
      ["cilindro com base e tampa", () => litho(100, 0.3, { shape: "cylinder", lid: true, led: { kind: "disc", size: 50, power: "cable" } }), LITHO_PROFILE],
      ["cilindro com fita e pilhas", () => litho(100, 0.3, { shape: "cylinder", led: { kind: "strip", size: 10, power: "battery" } }), LITHO_PROFILE],
      ["coração", () => litho(100, 0.3, { shape: "heart" }), LITHO_PROFILE],
      ["coração mínimo", () => litho(20, 0.15, { shape: "heart", border: 0, minT: 0.4, maxT: 1 }), LITHO_PROFILE],
      ["coração com base", () => litho(100, 0.3, { shape: "heart", led: { kind: "disc", size: 50, power: "cable" } }), LITHO_PROFILE],
      ["círculo", () => litho(100, 0.3, { shape: "circle" }), LITHO_PROFILE],
      ["círculo máximo", () => litho(250, 1, { shape: "circle", border: 15, minT: 3, maxT: 8 }), LITHO_PROFILE],
      ["círculo com fita e pilhas", () => litho(100, 0.3, { shape: "circle", led: { kind: "strip", size: 10, power: "battery" } }), LITHO_PROFILE],
      ["relevo", () => relief(100, 0.4, {}), RELIEF_PROFILE],
      ["relevo mínimo", () => relief(20, 0.15, { depth: 0.5, base: 0.6, smooth: 0, edge: 0, border: 0 }), RELIEF_PROFILE],
      ["relevo máximo", () => relief(250, 1, { depth: 10, base: 5, smooth: 3, edge: 1, border: 15, gamma: 2.5, invert: true }), RELIEF_PROFILE],
      ["relevo com fundo plano", () => relief(100, 0.4, {}, true), RELIEF_PROFILE],
      ["colorida", () => colorLitho(100, 0.4, {}), COLOR_LITHO_PROFILE],
      ["colorida mínima", () => colorLitho(20, 0.15, { maxInk: 0.4, whiteT: 0.4, border: 3 }), COLOR_LITHO_PROFILE],
      ["colorida máxima", () => colorLitho(250, 1, { maxInk: 4, whiteT: 3, border: 15 }), COLOR_LITHO_PROFILE],
      ["plana com base", () => litho(100, 0.3, { shape: "flat", led: { kind: "disc", size: 50, power: "cable" } }), LITHO_PROFILE],
    ]),
    ...cases("layered", "Quadro por camadas", [
      ["padrão", () => layered(100, 0.3, {}), { ...LAYERED_PROFILE, layerHeight: DEFAULT_LAYERED.layerHeight }],
      ["mínimo", () => layered(20, 0.15, { base: 0.2, relief: 0.4, layerHeight: 0.04 }), { ...LAYERED_PROFILE, layerHeight: 0.04 }],
      ["máximo", () => layered(250, 1, { base: 3, relief: 6, layerHeight: 0.32 }), { ...LAYERED_PROFILE, layerHeight: 0.32 }],
    ]),
    ...cases("cutter", "Cortador de biscoito", [
      ["padrão", () => cutter(80, {}), CUTTER_PROFILE],
      ["mínimo", () => cutter(20, { blade: 0.4, height: 5, rimWidth: 0, rimHeight: 0.6, plate: 1, relief: 0.4, clearance: 0.2, edgeMargin: 0 }), CUTTER_PROFILE],
      ["máximo", () => cutter(250, { blade: 3, height: 40, rimWidth: 15, rimHeight: 6, plate: 6, relief: 6, clearance: 2, edgeMargin: 6 }), CUTTER_PROFILE],
    ]),
    ...cases("extrude", "Extrusão de SVG", [
      ["padrão", () => extrude(60, 2, null)],
      ["mínimo", () => extrude(5, 0.2, { margin: 0, thickness: 0.4 })],
      ["máximo", () => extrude(300, 100, { margin: 30, thickness: 20 })],
    ]),
    ...cases("qr", "QR Code", [
      ["padrão", () => qr({ size: 50, base: 2, relief: 1, quiet: 2, corner: 3 })],
      ["mínimo", () => qr({ size: 15, base: 0.8, relief: 0.4, quiet: 1, corner: 0 })],
      ["máximo", () => qr({ size: 200, base: 8, relief: 4, quiet: 6, corner: 20 })],
      ["pirâmide", () => qr({ size: 80, base: 2, relief: 6, quiet: 2, corner: 3, style: "pyramid" })],
      ["degraus", () => qr({ size: 80, base: 2, relief: 8, quiet: 2, corner: 3, style: "steps", steps: 8 })],
      ["ondas", () => qr({ size: 80, base: 2, relief: 6, quiet: 2, corner: 3, style: "waves" })],
    ]),
    ...cases("spool", "Plaquinhas de rolo", [
      ["padrão", () => spool(1)],
      ["máximo", () => spool(spoolTagsThatFit(PLATE_MM - 2 * GAP_MM, GAP_MM))],
    ]),
    ...cases("colorsplit", "Separar cores de um 3MF", [
      ["padrão", () => split(1, false)],
      ["mínimo", () => split(0.2, false)],
      ["máximo", () => split(10, false)],
      ["corte com pino", () => split(1, true)],
    ]),
    // organizador de gaveta e talheres (#140): casos do Torno
    ...drawerCases(M),
    // organizador pela foto (#169): casos do Torno
    ...toolFitCases(M),
  ];
}
