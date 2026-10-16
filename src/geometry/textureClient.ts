import { createJobRunner } from "./jobClient";
import { copyModels, JobCancelled, modelBuffers, type Job } from "./jobs";
import { getManifold } from "./manifold";
import { readOwnObjects } from "./ownModel";
import { texturizeAll, type TexturizeAll, type TexturizeOptions } from "./texturize";
import type { TextureRequest, TextureResult } from "./textureWorker";
import type { Model } from "./types";

/**
 * Textura no worker (#222), com progresso e cancelamento, pelo cliente genérico (#248). Um pedido novo cancela o anterior. Sem
 * Worker (testes), roda na mesma thread.
 */
export { JobCancelled as TexturizeCancelled };

const run = createJobRunner<TextureRequest, TextureResult>({
  spawn: () => new Worker(new URL("./textureWorker.ts", import.meta.url), { type: "module" }),
  inline: async (req, hooks) => {
    if (req.kind === "read") return { kind: "read", models: readOwnObjects(req.bytes, req.name) };
    return { kind: "texturize", result: texturizeAll(await getManifold(), req.models, req.options, hooks) };
  },
  transfer: (req) => (req.kind === "read" ? [req.bytes.buffer as ArrayBuffer] : modelBuffers(req.models)),
});

export function texturizeAsync(models: Model[], options: TexturizeOptions, onProgress?: (fraction: number, stage: string) => void): Job<TexturizeAll> {
  const job = run({ kind: "texturize", models: copyModels(models), options }, onProgress);
  return { cancel: job.cancel, promise: job.promise.then((r) => (r.kind === "texturize" ? r.result : Promise.reject(new Error("Resposta inesperada")))) };
}

/** Lê o STL/3MF fora da tela principal (um 3MF de 17 MB leva alguns segundos). */
export function readObjectsAsync(bytes: Uint8Array, name: string): Promise<Model[]> {
  const job = run({ kind: "read", bytes: bytes.slice(), name });
  return job.promise.then((r) => (r.kind === "read" ? r.models : Promise.reject(new Error("Resposta inesperada"))));
}
