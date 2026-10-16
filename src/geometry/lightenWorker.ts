/// <reference lib="webworker" />
import { getManifold } from "./manifold";
import { latticeBlock, lightenModel, type LightenOpts, type LightenStats } from "./lighten";
import type { Model } from "./types";

/** Miolo leve fora da tela principal: o giroide e a erosão da casca levam segundos em peça grande. */
export type LightenSource = { kind: "model"; model: Model } | { kind: "block"; size: [number, number, number] };
export type LightenRequest = { id: number; source: LightenSource; opts: LightenOpts };
export type LightenResult = { model: Model; /** Metade da peça (corte ao meio), só para a prévia. */ section: Model; stats: LightenStats; warnings: string[] };
export type LightenReply = { id: number; ok: true; result: LightenResult } | { id: number; ok: false; error: string };

export async function runLighten(source: LightenSource, opts: LightenOpts): Promise<LightenResult> {
  const M = await getManifold();
  const r = source.kind === "block" ? { ...latticeBlock(M, source.size, opts), warnings: [] as string[] } : lightenModel(M, source.model, opts);
  const part = r.model.parts[0];
  return { model: r.model, section: { name: "Corte ao meio", parts: [{ ...part, mesh: r.section }] }, stats: r.stats, warnings: r.warnings };
}

self.onmessage = async (e: MessageEvent<LightenRequest>) => {
  const { id, source, opts } = e.data;
  try {
    const result = await runLighten(source, opts);
    const reply: LightenReply = { id, ok: true, result };
    self.postMessage(reply, [result.model, result.section].flatMap((m) => m.parts.flatMap((p) => [p.mesh.positions.buffer as ArrayBuffer, p.mesh.indices.buffer as ArrayBuffer])));
  } catch (err) {
    const reply: LightenReply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(reply);
  }
};
