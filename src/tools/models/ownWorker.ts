/// <reference lib="webworker" />
import { serveJob } from "../../geometry/jobWorker";
import { copyModels, modelBuffers } from "../../geometry/jobs";
import { getManifold } from "../../geometry/manifold";
import { faceAtPoint, faceHighlight, faceSize, planarFaces, readOwnFile, wideFaces, type PlanarFace, type Vec3 } from "../../geometry/ownModel";
import type { Model } from "../../geometry/types";
import { applyOwnCurved, applyOwnDecals, partAtPoint, type SurfaceSpot } from "./applyOwn";
import type { Layer } from "./layers";
import type { LayersResult, PreparedLayer } from "./applyLayers";

/** Nome ou logo na peça fora da tela principal (#248): ler o arquivo, achar as faces, clicar na peça e aplicar o desenho. */
export type FaceLite = Omit<PlanarFace, "triangles"> & { size: [number, number] };
export type OwnRequest =
  | { kind: "open"; key: string; bytes: Uint8Array; name: string }
  | { kind: "pick"; key: string; bytes: Uint8Array; name: string; point: Vec3; normal: Vec3 }
  | { kind: "highlight"; key: string; bytes: Uint8Array; name: string; faceId: string; color: string }
  | { kind: "apply"; key: string; bytes: Uint8Array; name: string; target: { faceId: string } | { spot: SurfaceSpot }; layers: Layer[]; prepared: PreparedLayer[] };
export type OwnResult =
  | { kind: "open"; models: Model[]; faces: FaceLite[] }
  | { kind: "pick"; faceId: string | null; part: number }
  | { kind: "highlight"; model: Model }
  | { kind: "apply"; result: LayersResult };

let cache: { key: string; model: Model; faces: PlanarFace[] } | null = null;
const opened = (key: string, bytes: Uint8Array, name: string) => {
  if (cache?.key !== key) {
    const model = readOwnFile(bytes, name);
    cache = { key, model, faces: wideFaces(model, planarFaces(model)) }; // lido uma vez; relê só se o arquivo mudou
  }
  return cache;
};

serveJob<OwnRequest, OwnResult>(async (req, hooks) => {
  if (req.kind === "apply") hooks.progress?.(0.05, cache?.key === req.key ? "Preparando" : "Lendo o arquivo");
  const o = opened(req.key, req.bytes, req.name);
  if (req.kind === "open") {
    const faces: FaceLite[] = o.faces.map(({ triangles, ...f }) => ({ ...f, size: faceSize(o.model, { ...f, triangles }) }));
    const models = copyModels([o.model]); // o worker guarda o original; a tela recebe esta cópia
    return { result: { kind: "open", models, faces }, transfer: modelBuffers(models) };
  }
  if (req.kind === "pick") {
    const f = faceAtPoint(o.model, o.faces, req.point, req.normal);
    return { result: { kind: "pick", faceId: f?.id ?? null, part: f ? 0 : partAtPoint(o.model, req.point) } };
  }
  if (req.kind === "highlight") {
    const f = o.faces.find((x) => x.id === req.faceId);
    if (!f) throw new Error("Face não encontrada.");
    const model = faceHighlight(o.model, f, req.color);
    return { result: { kind: "highlight", model }, transfer: modelBuffers([model]) };
  }
  const M = await getManifold();
  hooks.progress?.(0.3, "Aplicando o desenho");
  const target = req.target;
  let result: LayersResult;
  if ("faceId" in target) {
    const face = o.faces.find((f) => f.id === target.faceId);
    if (!face) throw new Error("Face não encontrada: escolha de novo.");
    result = await applyOwnDecals(o.model, face, req.layers, M, req.prepared);
  } else result = await applyOwnCurved(o.model, target.spot, req.layers, M, req.prepared);
  hooks.progress?.(0.95, "Montando a peça");
  return { result: { kind: "apply", result }, transfer: modelBuffers(result.models) };
});
