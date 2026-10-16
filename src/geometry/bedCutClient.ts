import { bedCut, type BedCutOptions } from "./bedCut";
import { meshBounds } from "./bounds";
import type { BedCutReply, BedCutRequest } from "./bedCutWorker";
import { loadFont } from "./fonts";
import { createJobRunner } from "./jobClient";
import type { Job } from "./jobs";
import { getManifold } from "./manifold";
import { readOwnFile } from "./ownModel";
import type { Vec3 } from "./bedCutPlan";

/**
 * Cortar para a mesa pelo worker (#248): ler o arquivo e cortar saem da tela principal. Um worker leve (ler: pedido novo só
 * ignora o velho) e um pesado (cortar: cancelar encerra o worker e o WASM). Sem Worker (testes) roda na mesma thread.
 */
type BedHooks = { progress?: (f: number, s: string) => void; cancelled?: () => boolean };
const inline = async (req: BedCutRequest, hooks: BedHooks): Promise<BedCutReply> => {
  const model = readOwnFile(req.bytes, req.name);
  if (req.kind === "open") {
    const b = meshBounds(model.parts.map((p) => p.mesh));
    return { kind: "open", dims: b ? [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] : [0, 0, 0] };
  }
  return { kind: "cut", result: bedCut(await getManifold(), model, req.options, req.options.numbers ? await loadFont("hanken") : null, hooks) };
};
const spawn = () => new Worker(new URL("./bedCutWorker.ts", import.meta.url), { type: "module" });
const transfer = (r: BedCutRequest) => [r.bytes.buffer as ArrayBuffer];
const light = createJobRunner<BedCutRequest, BedCutReply>({ spawn, inline, transfer, terminateOnCancel: false });
const heavy = createJobRunner<BedCutRequest, BedCutReply>({ spawn, inline, transfer });

/** Lê o arquivo e devolve só as medidas (a malha fica no worker). */
export async function openBedCutAsync(key: string, bytes: Uint8Array, name: string): Promise<Vec3> {
  const r = await light({ kind: "open", key, bytes: bytes.slice(), name }).promise;
  if (r.kind !== "open") throw new Error("Resposta inesperada do worker.");
  return r.dims;
}

export function bedCutAsync(key: string, bytes: Uint8Array, name: string, options: BedCutOptions, onProgress?: (f: number, s: string) => void): Job<Extract<BedCutReply, { kind: "cut" }>["result"]> {
  const job = heavy({ kind: "cut", key, bytes: bytes.slice(), name, options }, onProgress);
  return {
    cancel: job.cancel,
    promise: job.promise.then((r) => (r.kind === "cut" ? r.result : Promise.reject(new Error("Resposta inesperada do worker.")))),
  };
}
