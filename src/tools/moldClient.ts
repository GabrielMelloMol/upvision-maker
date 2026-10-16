import { meshBounds } from "../geometry/bounds";
import { createJobRunner } from "../geometry/jobClient";
import { JobCancelled, type Job } from "../geometry/jobs";
import { getManifold } from "../geometry/manifold";
import { bestPlane, bestSetup, buildMold, mergedMesh, modelSolid, type MoldAxis, type MoldParams } from "../geometry/mold";
import { readOwnFile } from "../geometry/ownModel";
import type { MoldReply, MoldRequest } from "./moldWorker";

/**
 * Molde pelo worker (#248): ler a peça, sugerir o plano e montar saem da tela principal. Worker leve (ler e sugerir: pedido novo só
 * ignora o velho) e pesado (montar: cancelar encerra o worker e o WASM). Sem Worker (testes) roda na mesma thread.
 */
const inline = async (req: MoldRequest, hooks: { progress?: (f: number, s: string) => void; cancelled?: () => boolean }): Promise<MoldReply> => {
  const model = readOwnFile(req.bytes, req.name);
  const mesh = mergedMesh(model);
  if (req.kind === "open") {
    const auto = bestSetup(mesh);
    return { kind: "open", bounds: meshBounds(model.parts.map((p) => p.mesh)), axis: auto.axis, offset: auto.offset };
  }
  if (req.kind === "plane") return { kind: "plane", offset: bestPlane(mesh, req.axis) };
  const M = await getManifold();
  const { solid, holes } = modelSolid(M, model);
  try {
    if (hooks.cancelled?.()) throw new JobCancelled();
    return { kind: "build", out: buildMold(M, solid, mesh, req.params), holes };
  } finally {
    solid.delete();
  }
};
const spawn = () => new Worker(new URL("./moldWorker.ts", import.meta.url), { type: "module" });
const transfer = (r: MoldRequest) => [r.bytes.buffer as ArrayBuffer];
const light = createJobRunner<MoldRequest, MoldReply>({ spawn, inline, transfer, terminateOnCancel: false });
const heavy = createJobRunner<MoldRequest, MoldReply>({ spawn, inline, transfer });

const expect = async <K extends MoldReply["kind"]>(job: Job<MoldReply>, kind: K): Promise<Extract<MoldReply, { kind: K }>> => {
  const r = await job.promise;
  if (r.kind !== kind) throw new Error("Resposta inesperada do worker.");
  return r as Extract<MoldReply, { kind: K }>;
};

export const openMoldAsync = (key: string, bytes: Uint8Array, name: string) => expect(light({ kind: "open", key, bytes: bytes.slice(), name }), "open");
export const planeAsync = async (key: string, bytes: Uint8Array, name: string, axis: MoldAxis) => (await expect(light({ kind: "plane", key, bytes: bytes.slice(), name, axis }), "plane")).offset;

export function buildMoldAsync(key: string, bytes: Uint8Array, name: string, params: MoldParams, onProgress?: (f: number, s: string) => void): Job<Extract<MoldReply, { kind: "build" }>> {
  const job = heavy({ kind: "build", key, bytes: bytes.slice(), name, params }, onProgress);
  return { cancel: job.cancel, promise: expect(job, "build") };
}
