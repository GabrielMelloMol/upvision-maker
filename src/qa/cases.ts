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
const QA_INPUTS: Record<string, Params> = { pix: { key: "loja@upvision.app", name: "UpVision Maker", city: "Sao Paulo" }, reliefTile: { output: "both" }, layeredSign: { frame: true, ornament: "paw" } }; // fatia o molde junto do azulejo e a moldura do letreiro

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
    artLayers: def.art && def.artColors ? testArtLayers(M) : null,
    text,
    arc: (s, h, r, side) => (s.trim() ? arcTextToCrossSection(M, f, s, h, r, side) : null),
    fontText: (k) => (s, h) => (s.trim() ? textToCrossSection(M, extra[k] ?? f, s, h) : null),
    offset: () => [0, 0],
  };
}

/** Padrão, todos os campos numéricos no mínimo e todos no máximo. */
export function variants(def: ModelDef): [QaCase["variant"], Params][] {
  const nums = def.sections.flatMap((s) => s.fields).filter((f) => f.kind === "num");
  const base = { ...def.defaults, ...QA_INPUTS[def.id] };
  const at = (pick: (f: Extract<(typeof nums)[number], { kind: "num" }>) => number): Params => ({ ...base, ...Object.fromEntries(nums.map((f) => [f.k, f.kind === "num" ? pick(f) : 0])) });
  if (!nums.length) return [["padrão", base]];
  return [
    ["padrão", base],
    ["mínimo", at((f) => f.min)],
    ["máximo", at((f) => f.max)],
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
        return { models: out.models, pauses: out.pauses ?? [], warnings: out.warnings ?? [] };
      },
    })),
  );
}

export { MissingInput };
