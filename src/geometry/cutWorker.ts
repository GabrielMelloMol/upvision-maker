/// <reference lib="webworker" />
import { getManifold } from "./manifold";
import { runCuts, type CutPlan, type CutsResult } from "./cutSequence";
import { suggestCuts, type Suggestion } from "./cutSuggest";
import type { Mesh, Model } from "./types";

/** Corte parcial fora da tela principal: peças grandes (centenas de milhares de triângulos) não travam os controles. */
export type CutRequest = { id: number; kind: "cut"; model: Model; plan: CutPlan } | { id: number; kind: "suggest"; model: Model };
export type CutReply = { id: number; ok: true; cut?: CutsResult; suggestions?: Suggestion[] } | { id: number; ok: false; error: string };

/** Buffers de todas as malhas, para passar adiante sem copiar. */
export function transferables(models: Model[]): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>(); // o mesmo buffer duas vezes na lista de transferência dá erro
  const add = (m: Mesh) => {
    out.add(m.positions.buffer as ArrayBuffer);
    out.add(m.indices.buffer as ArrayBuffer);
  };
  for (const m of models) {
    for (const p of m.parts) {
      add(p.mesh);
      if (p.lines) out.add(p.lines.points.buffer as ArrayBuffer);
    }
  }
  return [...out];
}

self.onmessage = async (e: MessageEvent<CutRequest>) => {
  const req = e.data;
  try {
    const M = await getManifold();
    if (req.kind === "suggest") {
      const reply: CutReply = { id: req.id, ok: true, suggestions: suggestCuts(M, req.model) };
      self.postMessage(reply);
      return;
    }
    const cut = runCuts(M, req.model, req.plan);
    const reply: CutReply = { id: req.id, ok: true, cut };
    self.postMessage(reply, transferables([...cut.models, ...cut.preview]));
  } catch (err) {
    const reply: CutReply = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(reply);
  }
};
