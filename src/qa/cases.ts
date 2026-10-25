import { testArt, testArtLayers } from "../geometry/models/sampleArt";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadFont } from "../geometry/fonts";
import type { ManifoldToplevel } from "../geometry/manifold";
import { MissingInput, type ModelCtx } from "../geometry/models/common";
import type { PrintProfile } from "../geometry/printProfile";
import { arcTextToCrossSection, textToCrossSection } from "../geometry/text";
import type { Model } from "../geometry/types";
import { MODELS, type ModelDef, type Params } from "../tools/models/defs";
import { profileFor } from "../tools/models/printProfiles";

/** Um caso da varredura (#90): um modelo com um jogo de valores, pronto para checar e fatiar. */
export type QaCase = {
  key: string; // "id:variante" — chave estável do relatório
  owner: string;
  group: string;
  label: string;
  variant: "padrão" | "mínimo" | "máximo" | string;
  build: () => Promise<{ models: Model[]; pauses: number[]; warnings: string[] }>;
  profile?: PrintProfile;
};

/** Dono de cada modelo na varredura (combinado na #90): casa/cozinha e a onda mafagrafos com o Torno. */
const TORNO_IDS = new Set(["layeredSign", "windowFrame", "wallLetters", "namePendants", "namesPanel"]);
export const ownerOf = (d: ModelDef) => (d.category === "home" || d.category === "kitchen" || TORNO_IDS.has(d.id) ? "Torno" : "Forja");

/** Os .ttf vêm do Vite como "/src/assets/..."; no Node lê do disco. */
export function serveFontsFromDisk(root: string) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/src/")) return new Response(readFileSync(join(root, decodeURIComponent(url.split("?")[0]))));
    return orig(input);
  }) as typeof fetch;
}

/** Entradas que a pessoa sempre preenche e o padrão deixa vazias (sem elas o modelo só pede o campo). */
// Cartão de música: o código do Spotify guardado (SVG de exemplo salvo) vai nos casos padrão, mínimo e máximo; o QR entra num caso à parte
const SPOTIFY_SAMPLE = readFileSync(new URL("../../tests/fixtures/spotify/scannable-track.svg", import.meta.url), "utf8");
const MUSIC_LINK = "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl";
const QA_INPUTS: Record<string, Params> = {
  musicCard: { code: "spotify", codeLink: MUSIC_LINK, spotifySvg: SPOTIFY_SAMPLE, spotifyUri: "spotify:track:11dFghVXANMlKmJXsNCbNl", codeSize: 70 }, pix: { key: "loja@upvision.app", name: "UpVision Maker", city: "Sao Paulo" }, reliefTile: { output: "both" }, layeredSign: { frame: true, ornament: "paw" } }; // fatia o molde junto do azulejo e a moldura do letreiro

// desenho de teste: o mesmo das miniaturas (#149)
export { testArt, testArtLayers };

export async function modelCtx(M: ManifoldToplevel, p: Params, def: ModelDef): Promise<ModelCtx> {
  const f = await loadFont("hanken");
  const fields = def.sections.flatMap((s) => s.fields);
  const extra = Object.fromEntries(await Promise.all(fields.filter((x) => x.kind === "font").map(async (x) => [x.k, await loadFont(String(p[x.k]))] as const)));
  const text = (s: string, h: number) => (s.trim() ? textToCrossSection(M, f, s, h) : null);
  return {
    M,
    art: def.art ? testArt(M) : null,
    art2: def.art2 ? testArt(M) : null,
    artLayers: def.art && def.artColors ? testArtLayers(M) : null,
    text,
    arc: (s, h, r, side) => (s.trim() ? arcTextToCrossSection(M, f, s, h, r, side) : null),
    fontText: (k) => (s, h) => (s.trim() ? textToCrossSection(M, extra[k] ?? f, s, h) : null),
    offset: () => [0, 0],
  };
}

/** Variações extras por modelo (além de padrão, mínimo e máximo): opções que mudam a peça e precisam fatiar também. */
const QA_EXTRA: Record<string, Record<string, Params>> = { starMap: { "estrelas vazadas": { hollow: true, density: "few" } }, musicCard: { QR: { code: "qr", codeSize: 44 } }, wallLetters: { "FESTA 600 mm (muitas partes)": { height: 600 } }, kitBicho: { saurópode: { head: "sauro", tail: "thick" }, "T-rex": { head: "trex", tail: "thick" } }, aroma: { "teste da rosca": { print: "test" }, "sem olhal, folga larga": { keyring: false, clearance: 0.6 }, "feltro grande, muitos furos": { feltDiameter: 45, holes: 16, holeDiameter: 3 }, coração: { shape: "heart" }, gota: { shape: "drop", edge: "chamfer" }, hexágono: { shape: "hex", knurl: false, edge: "none" } }, openerImage: { lata: { kind: "can" }, "abridor à direita, argola à esquerda": { openerSide: "right", ringSide: "left" }, "abridor fora do desenho": { fit: false }, "abridor dentro do desenho (manual)": { fit: false, overlap: 15 }, "sem borda levantada": { rim: false } }, cupHandle: { "anel de teste": { print: "test" }, "copo pequeno": { baseDiameter: 62, topDiameter: 78, bodyHeight: 165, gripZ: 45, sleeveHeight: 35 }, "nome gravado": { nameMode: "engraved" }, "luva vazada": { sleeveStyle: "cutouts" }, "luva com faixas": { sleeveStyle: "bands" }, "sem marcas de dedo, sem fantasma": { grooves: false, showCup: false } }, kitCard: { veículo: { mode: "vehicle" }, "vários cartões": { cardSize: "medium", ribs: 3, spines: 1, copies: 4 }, "uma placa lateral": { spines: 1 } }, candyMold: { "forma de teste": { print: "test" }, estrela: { shape: "star", stampText: "Ana" }, flor: { shape: "flower" }, barrinha: { shape: "bar", weight: 40, depth: 12 } }, drainCover: { "só cobre": { style: "cover" }, "com furos": { style: "strainer" } }, funnel: { "sem borda reforçada": { bead: false } }, oring: { "sem achatar": { flat: false } }, boardBox: { "bandeja de teste": { print: "test" }, parafuso: { mount: "screws" }, "Raspberry Pi 4": { boardL: 85, boardW: 56, boardT: 1.4, holes: "3.5, 3.5; 61.5, 3.5; 3.5, 52.5; 61.5, 52.5", holeD: 2.7, connectors: "right, 10.25, 16.5, 14, 0\nright, 29, 15, 16, 0\nright, 47, 15, 16, 0\nbottom, 11.2, 9.5, 4, 0\nbottom, 26, 8, 4, 0" }, "sem furos (só apoios)": { holes: "", mount: "pads", boardL: 51.5, boardW: 28.3, connectors: "left, 14.2, 9, 4.5, 0" } }, spoolHolder: { "eixo em 2 partes": { axleParts: "two" }, "parede grossa": { axleWall: 8 } }, drillJig: { "sem batente": { lip: false } }, radiusGauge: { "raios grandes": { radii: "10; 12; 15; 20; 25; 30" } }, slingshot: { "nome gravado": { nameMode: "engraved" }, "sem nome": { nameMode: "none" } }, stampMold: { "forma para massinha": { kind: "clay" }, "forma para massinha invertida, sem saída": { kind: "clay", invert: true, draft: 0 }, "forma no mínimo": { kind: "clay", size: 40, cavity: 3, clayRelief: 0.6, border: 2, wall: 1.2, draft: 0, thumbSize: 15 }, "forma no máximo": { kind: "clay", size: 300, cavity: 6, clayRelief: 3, border: 20, wall: 4, draft: 3, bridge: 5, thumbSize: 45 } }, phoneCase: { "peça de teste": { print: "test" }, X: { pattern: "cross" }, "com nome": { name: "Ana", pattern: "smooth" } } };

/** Padrão, todos os campos numéricos no mínimo e todos no máximo (mais as variações extras do modelo). */
export function variants(def: ModelDef): [QaCase["variant"], Params][] {
  const nums = def.sections.flatMap((s) => s.fields).filter((f) => f.kind === "num");
  const base = { ...def.defaults, ...QA_INPUTS[def.id] };
  const at = (pick: (f: Extract<(typeof nums)[number], { kind: "num" }>) => number): Params => ({ ...base, ...Object.fromEntries(nums.map((f) => [f.k, f.kind === "num" ? pick(f) : 0])) });
  if (!nums.length) return [["padrão", base]];
  const extra = Object.entries(QA_EXTRA[def.id] ?? {}).map(([name, patch]): [QaCase["variant"], Params] => [name, { ...base, ...patch }]);
  return [
    ["padrão", base],
    ["mínimo", at((f) => f.min)],
    ["máximo", at((f) => f.max)],
    ...extra,
  ];
}

export function modelCases(M: ManifoldToplevel, filter: (d: ModelDef) => boolean): QaCase[] {
  return MODELS.filter(filter).flatMap((def) =>
    variants(def).map(([variant, p]) => ({
      key: `${def.id}:${variant}`,
      owner: ownerOf(def),
      group: def.category,
      label: `${def.label} (${def.id})`,
      variant,
      profile: profileFor(def.id, p),
      build: async () => {
        const out = def.build(await modelCtx(M, p, def), p);
        return { models: out.models.filter((m) => !m.previewOnly), pauses: out.pauses ?? [], warnings: out.warnings ?? [] };
      },
    })),
  );
}

export { MissingInput };
