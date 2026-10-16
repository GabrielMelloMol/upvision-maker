/// <reference lib="webworker" />
import { runCuts, type CutPlan, type CutsResult } from "./cutSequence";
import { suggestCuts, type Suggestion } from "./cutSuggest";
import { serveJob } from "./jobWorker";
import { modelBuffers } from "./jobs";
import { getManifold } from "./manifold";
import { readOwnFile } from "./ownModel";
import type { Model } from "./types";

/** Corte parcial fora da tela principal: ler o arquivo, cortar e sugerir cortes em peças grandes não travam os controles. */
export type CutRequest =
  | { kind: "read"; bytes: Uint8Array; name: string }
  | { kind: "cut"; model: Model; plan: CutPlan }
  | { kind: "suggest"; model: Model };
export type CutReply = { kind: "read"; model: Model } | { kind: "cut"; cut: CutsResult } | { kind: "suggest"; suggestions: Suggestion[] };

serveJob<CutRequest, CutReply>(async (req, hooks) => {
  if (req.kind === "read") {
    hooks.progress?.(0.1, "Lendo o arquivo");
    const model = readOwnFile(req.bytes, req.name);
    return { result: { kind: "read", model }, transfer: modelBuffers([model]) };
  }
  const M = await getManifold();
  if (req.kind === "suggest") return { result: { kind: "suggest", suggestions: suggestCuts(M, req.model) } };
  const cut = runCuts(M, req.model, req.plan, hooks);
  return { result: { kind: "cut", cut }, transfer: modelBuffers([...cut.models, ...cut.preview]) };
});
