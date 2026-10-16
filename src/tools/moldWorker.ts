/// <reference lib="webworker" />
import { meshBounds, type Bounds } from "../geometry/bounds";
import { serveJob } from "../geometry/jobWorker";
import { JobCancelled, modelBuffers } from "../geometry/jobs";
import { getManifold } from "../geometry/manifold";
import { bestPlane, bestSetup, buildMold, mergedMesh, modelSolid, type MoldAxis, type MoldOutput, type MoldParams } from "../geometry/mold";
import { readOwnFile } from "../geometry/ownModel";
import type { Mesh, Model } from "../geometry/types";

/** Molde fora da tela principal (#248): ler a peça, achar o plano que menos prende e montar as duas metades. */
export type MoldRequest =
  | { kind: "open"; key: string; bytes: Uint8Array; name: string }
  | { kind: "plane"; key: string; bytes: Uint8Array; name: string; axis: MoldAxis }
  | { kind: "build"; key: string; bytes: Uint8Array; name: string; params: MoldParams };
export type MoldReply =
  | { kind: "open"; bounds: Bounds | null; axis: MoldAxis; offset: number }
  | { kind: "plane"; offset: number }
  | { kind: "build"; out: MoldOutput; holes: number };

let cache: { key: string; model: Model; mesh: Mesh } | null = null;
const opened = (key: string, bytes: Uint8Array, name: string) => {
  if (cache?.key !== key) {
    const model = readOwnFile(bytes, name);
    cache = { key, model, mesh: mergedMesh(model) };
  }
  return cache;
};

serveJob<MoldRequest, MoldReply>(async (req, hooks) => {
  hooks.progress?.(0.05, "Lendo a peça");
  const file = opened(req.key, req.bytes, req.name);
  if (req.kind === "open") {
    const auto = bestSetup(file.mesh);
    return { result: { kind: "open", bounds: meshBounds(file.model.parts.map((p) => p.mesh)), axis: auto.axis, offset: auto.offset } };
  }
  if (req.kind === "plane") return { result: { kind: "plane", offset: bestPlane(file.mesh, req.axis) } };
  hooks.progress?.(0.2, "Fechando a malha");
  const M = await getManifold();
  const { solid, holes } = modelSolid(M, file.model);
  try {
    if (hooks.cancelled?.()) throw new JobCancelled();
    hooks.progress?.(0.4, "Montando as duas metades");
    const out = buildMold(M, solid, file.mesh, req.params);
    return { result: { kind: "build", out, holes }, transfer: modelBuffers(out.models) };
  } finally {
    solid.delete();
  }
});
