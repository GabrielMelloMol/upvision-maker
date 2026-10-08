import { readFileSync } from "node:fs";
import { join } from "node:path";
import { qrMatrix } from "../domain/qr";
import { splitByColor } from "../geometry/colorSplit";
import { buildCutter, DEFAULT_CUTTER, type CutterParams } from "../geometry/cutter";
import { extrudeDesign } from "../geometry/extrude";
import { loadFont } from "../geometry/fonts";
import { composeKeychainArt } from "../geometry/keychainArt";
import { buildKeychain, DEFAULT_KEYCHAIN, layoutOnPlate, type KeychainParams } from "../geometry/keychain";
import { buildLayeredPicture, DEFAULT_LAYERED, type LayeredParams } from "../geometry/layeredPicture";
import { buildLithophane, DEFAULT_LITHO, type LithoParams } from "../geometry/lithophane";
import type { CS, ManifoldToplevel } from "../geometry/manifold";
import { buildMedalDesign, DEFAULT_MEDAL_DESIGN, type MedalDesign } from "../geometry/medalDesign";
import { cutModels, DEFAULT_CUT } from "../geometry/planeCut";
import { CUTTER_PROFILE, DEFAULT_PROFILE, LAYERED_PROFILE, LITHO_PROFILE, type PrintProfile } from "../geometry/printProfile";
import { qrModel } from "../geometry/qr3d";
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

  const medal = async (patch: Partial<MedalDesign>): Promise<Out> => {
    const f = await loadFont("hanken");
    const warnings: string[] = [];
    const ctx = { M, art: null, artLayers: null, warn: (m: string) => void warnings.push(m), text: (s: string, h: number) => textToCrossSection(M, f, s, h), arc: (s: string, h: number, r: number, side: "top" | "bottom") => arcTextToCrossSection(M, f, s, h, r, side) };
    return { models: buildMedalDesign(ctx, { ...DEFAULT_MEDAL_DESIGN, ...patch }), warnings };
  };
  const medalSizes = (v: number) => ({ topSize: v, centerSize: v, rankSize: v, dateSize: v, bottomSize: v });

  const litho = (width: number, cell: number, patch: Partial<LithoParams>): Out => {
    const ph = photo(width, cell);
    return { models: [buildLithophane(M, ph.luma, ph.cols, ph.rows, ph.step, { ...DEFAULT_LITHO, ...patch })] };
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

  const qr = (p: { size: number; base: number; relief: number; quiet: number; corner: number }): Out => {
    const r = qrModel(M, qrMatrix("https://upvision.app/qa"), { sizeMm: p.size, baseMm: p.base, reliefMm: p.relief, quiet: p.quiet, cornerMm: p.corner }, "QR Code");
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

  return [
    ...cases("keychain", "Chaveiro", [
      ["padrão", () => keychain(14, {})],
      ["mínimo", () => keychain(5, { base: 0.8, relief: 0.4, border: 1 })],
      ["máximo", () => keychain(60, { base: 8, relief: 5, border: 10 })],
      ["etiqueta", () => keychain(14, { shape: "rect", rectWidth: 30 })],
      ["3 camadas", () => keychain(14, { layers: 3 })],
      ["arte girada", () => keychainArt()],
      ["lote 30", () => keychain(14, {}, Array.from({ length: 30 }, (_, i) => `Nome ${i + 1}`))],
    ]),
    ...cases("medal", "Medalha", [
      ["padrão", () => medal({})],
      ["mínimo", () => medal({ diameter: 25, thickness: 1.5, rim: 0, relief: 0.4, arcInset: 0, backSize: 2, ...medalSizes(2) })],
      ["máximo", () => medal({ diameter: 150, thickness: 10, rim: 12, relief: 5, arcInset: 10, backSize: 20, ...medalSizes(24) })],
    ]),
    ...cases("lithophane", "Litofania", [
      ["padrão", () => litho(100, 0.3, {}), LITHO_PROFILE],
      ["mínimo", () => litho(20, 0.15, { minT: 0.4, maxT: 1, border: 0, arc: 30 }), LITHO_PROFILE],
      ["máximo", () => litho(250, 1, { minT: 3, maxT: 8, border: 15, arc: 270 }), LITHO_PROFILE],
      ["curva", () => litho(100, 0.3, { shape: "curved" }), LITHO_PROFILE],
      ["caixa", () => litho(100, 0.3, { shape: "box" }), LITHO_PROFILE],
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
    ]),
    ...cases("spool", "Plaquinhas de rolo", [
      ["padrão", () => spool(1)],
      ["máximo", () => spool(spoolTagsThatFit(PLATE_MM - 2 * GAP_MM, GAP_MM))],
    ]),
    ...cases("colorsplit", "Separar 3MF por cor", [
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
