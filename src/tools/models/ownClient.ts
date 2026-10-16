import { createJobRunner } from "../../geometry/jobClient";
import type { Job } from "../../geometry/jobs";
import { getManifold } from "../../geometry/manifold";
import { faceAtPoint, faceHighlight, faceSize, planarFaces, readOwnFile, wideFaces } from "../../geometry/ownModel";
import { applyOwnCurved, applyOwnDecals, partAtPoint } from "./applyOwn";
import type { LayersResult } from "./applyLayers";
import type { OwnRequest, OwnResult } from "./ownWorker";

/**
 * Nome ou logo pelo worker (#248). Um worker leve (abrir, clicar na peça, destacar a face: pedido novo só ignora o velho e o arquivo lido
 * fica guardado) e um para aplicar o desenho (cancelar encerra). Sem Worker (testes), roda na mesma thread.
 */
let inlineCache: { key: string; model: ReturnType<typeof readOwnFile>; faces: ReturnType<typeof planarFaces> } | null = null;
const inlineOpen = (r: { key: string; bytes: Uint8Array; name: string }) => {
  if (inlineCache?.key !== r.key) {
    const model = readOwnFile(r.bytes, r.name);
    inlineCache = { key: r.key, model, faces: wideFaces(model, planarFaces(model)) };
  }
  return inlineCache;
};
const inline = async (req: OwnRequest): Promise<OwnResult> => {
  const o = inlineOpen(req);
  if (req.kind === "open") return { kind: "open", models: [o.model], faces: o.faces.map(({ triangles, ...f }) => ({ ...f, size: faceSize(o.model, { ...f, triangles }) })) };
  if (req.kind === "pick") {
    const f = faceAtPoint(o.model, o.faces, req.point, req.normal);
    return { kind: "pick", faceId: f?.id ?? null, part: f ? 0 : partAtPoint(o.model, req.point) };
  }
  if (req.kind === "highlight") return { kind: "highlight", model: faceHighlight(o.model, o.faces.find((x) => x.id === req.faceId)!, req.color) };
  const M = await getManifold();
  const t = req.target;
  const result = "faceId" in t ? await applyOwnDecals(o.model, o.faces.find((f) => f.id === t.faceId)!, req.layers, M, req.prepared) : await applyOwnCurved(o.model, t.spot, req.layers, M, req.prepared);
  return { kind: "apply", result };
};
const spawn = () => new Worker(new URL("./ownWorker.ts", import.meta.url), { type: "module" });
const transfer = (r: OwnRequest) => [r.bytes.buffer as ArrayBuffer];
const light = createJobRunner<OwnRequest, OwnResult>({ spawn, inline, transfer, terminateOnCancel: false });
const heavy = createJobRunner<OwnRequest, OwnResult>({ spawn, inline, transfer });

type Base = { key: string; bytes: Uint8Array; name: string };
const expect = async <K extends OwnResult["kind"]>(p: Promise<OwnResult>, kind: K): Promise<Extract<OwnResult, { kind: K }>> => {
  const r = await p;
  if (r.kind !== kind) throw new Error("Resposta inesperada do worker.");
  return r as Extract<OwnResult, { kind: K }>;
};

export const openOwn = (b: Base) => expect(light({ kind: "open", ...b, bytes: b.bytes.slice() }).promise, "open");
export const pickOwn = (b: Base, point: [number, number, number], normal: [number, number, number]) => expect(light({ kind: "pick", ...b, bytes: b.bytes.slice(), point, normal }).promise, "pick");
export const highlightOwn = (b: Base, faceId: string, color: string) => expect(light({ kind: "highlight", ...b, bytes: b.bytes.slice(), faceId, color }).promise, "highlight");

export function applyOwnAsync(b: Base, target: Extract<OwnRequest, { kind: "apply" }>["target"], layers: Extract<OwnRequest, { kind: "apply" }>["layers"], prepared: Extract<OwnRequest, { kind: "apply" }>["prepared"], onProgress?: (f: number, s: string) => void): Job<LayersResult> {
  const job = heavy({ kind: "apply", ...b, bytes: b.bytes.slice(), target, layers, prepared }, onProgress);
  return { cancel: job.cancel, promise: expect(job.promise, "apply").then((r) => r.result) };
}
