/// <reference lib="webworker" />
import { meshBounds } from "./bounds";
import { serveJob } from "./jobWorker";
import { modelBuffers, type Hooks } from "./jobs";
import { latticeBlock, lightenModel, type LightenOpts, type LightenStats } from "./lighten";
import { getManifold } from "./manifold";
import { readOwnFile } from "./ownModel";
import type { Model } from "./types";

/** Miolo leve fora da tela principal: ler a peça, o giroide e a erosão da casca levam segundos em peça grande. */
export type LightenSource = { kind: "file"; key: string; bytes: Uint8Array; name: string } | { kind: "block"; size: [number, number, number] };
export type LightenRequest = { kind: "open"; key: string; bytes: Uint8Array; name: string } | { kind: "run"; source: LightenSource; opts: LightenOpts };
export type LightenResult = { model: Model; /** Metade da peça (corte ao meio), só para a prévia. */ section: Model; stats: LightenStats; warnings: string[] };
export type LightenReply = { kind: "open"; triangles: number; empty: boolean } | { kind: "run"; result: LightenResult };

let cache: { key: string; model: Model } | null = null;
const opened = (key: string, bytes: Uint8Array, name: string): Model => {
  if (cache?.key !== key) cache = { key, model: readOwnFile(bytes, name) };
  return cache.model;
};

export async function runLighten(model: Model | { size: [number, number, number] }, opts: LightenOpts, hooks: Hooks = {}): Promise<LightenResult> {
  hooks.progress?.(0.15, "Preparando o motor");
  const M = await getManifold();
  hooks.progress?.(0.3, "Calculando o miolo");
  const r = "size" in model ? { ...latticeBlock(M, model.size, opts), warnings: [] as string[] } : lightenModel(M, model, opts);
  hooks.progress?.(0.95, "Montando o resultado");
  const part = r.model.parts[0];
  return { model: r.model, section: { name: "Corte ao meio", parts: [{ ...part, mesh: r.section }] }, stats: r.stats, warnings: r.warnings };
}

export function openLighten(model: Model): Extract<LightenReply, { kind: "open" }> {
  return { kind: "open", triangles: model.parts.reduce((n, p) => n + p.mesh.indices.length / 3, 0), empty: !meshBounds(model.parts.map((p) => p.mesh)) };
}

serveJob<LightenRequest, LightenReply>(async (req, hooks) => {
  if (req.kind === "open") return { result: openLighten(opened(req.key, req.bytes, req.name)) };
  hooks.progress?.(0.05, "Lendo a peça");
  const s = req.source;
  const result = await runLighten(s.kind === "block" ? { size: s.size } : opened(s.key, s.bytes, s.name), req.opts, hooks);
  return { result: { kind: "run", result }, transfer: [...modelBuffers([result.model]), ...modelBuffers([result.section])] };
});
