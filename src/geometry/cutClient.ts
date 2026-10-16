import { createJobRunner } from "./jobClient";
import { copyModels, JobCancelled, modelBuffers, type Job } from "./jobs";
import { getManifold } from "./manifold";
import { runCuts, type CutPlan, type CutsResult } from "./cutSequence";
import { suggestCuts, type Suggestion } from "./cutSuggest";
import type { CutReply, CutRequest, FitPlane } from "./cutWorker";
import { fitRegionToPart } from "./cutFit";
import type { Region, RegionKind } from "./cutRegion";
import type { Vec3 } from "./partialCut";
import { readOwnFile } from "./ownModel";
import type { Model } from "./types";

/**
 * Corte parcial pelo worker (#248): ler o arquivo, cortar (com progresso e Cancelar) e sugerir cortes. Um worker para cada tipo de
 * pedido; pedido novo do mesmo tipo cancela o anterior (o worker e o WASM são encerrados). Sem Worker (testes), roda na mesma thread.
 */
export { JobCancelled as CutCancelled };

const spawn = () => new Worker(new URL("./cutWorker.ts", import.meta.url), { type: "module" });
const inline = async (req: CutRequest, hooks: { progress?: (f: number, s: string) => void; cancelled?: () => boolean }): Promise<CutReply> => {
  if (req.kind === "read") return { kind: "read", model: readOwnFile(req.bytes, req.name) };
  const M = await getManifold();
  if (req.kind === "fit") return { kind: "fit", region: fitRegionToPart(M, req.model, req.plane, req.shape, req.near) };
  if (req.kind === "suggest") return { kind: "suggest", suggestions: suggestCuts(M, req.model) };
  return { kind: "cut", cut: runCuts(M, req.model, req.plan, hooks) };
};
const transfer = (r: CutRequest) => (r.kind === "read" ? [r.bytes.buffer as ArrayBuffer] : modelBuffers([r.model]));
const reading = createJobRunner<CutRequest, CutReply>({ spawn, inline, transfer, terminateOnCancel: false });
const cutting = createJobRunner<CutRequest, CutReply>({ spawn, inline, transfer });
const fitting = createJobRunner<CutRequest, CutReply>({ spawn, inline, transfer });
const suggesting = createJobRunner<CutRequest, CutReply>({ spawn, inline, transfer });

/** Lê o STL/3MF fora da tela principal (um 3MF de 17 MB leva alguns segundos). */
export async function readModelAsync(bytes: Uint8Array, name: string): Promise<Model> {
  const r = await reading({ kind: "read", bytes: bytes.slice(), name }).promise;
  if (r.kind !== "read") throw new Error("Resposta inesperada do worker.");
  return r.model;
}

export function cutAsync(model: Model, plan: CutPlan, onProgress?: (f: number, s: string) => void): Job<CutsResult> {
  const job = cutting({ kind: "cut", model: copyModels([model])[0], plan }, onProgress);
  return { cancel: job.cancel, promise: job.promise.then((r) => (r.kind === "cut" ? r.cut : Promise.reject(new Error("Resposta inesperada do worker.")))) };
}

export async function suggestAsync(model: Model): Promise<Suggestion[]> {
  const r = await suggesting({ kind: "suggest", model: copyModels([model])[0] }).promise;
  if (r.kind !== "suggest") throw new Error("Resposta inesperada do worker.");
  return r.suggestions;
}

/** Região que envolve a parte de cima do plano mais perto de `near` (clique na prévia ou troca de forma), fora da tela principal. */
export function fitAsync(model: Model, plane: FitPlane, shape: RegionKind, near: Vec3): Job<Region> {
  const job = fitting({ kind: "fit", model: copyModels([model])[0], plane, shape, near });
  return { cancel: job.cancel, promise: job.promise.then((r) => (r.kind === "fit" ? r.region : Promise.reject(new Error("Resposta inesperada do worker.")))) };
}
