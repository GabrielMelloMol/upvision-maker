import type { ColorSelection } from "./colorRegions";
import { createJobRunner } from "./jobClient";
import type { Job } from "./jobs";
import { getManifold } from "./manifold";
import { cutInParts, cutModels, type CutOptions } from "./planeCut";
import { colorClusters, colorPreview, hasMaterialColors, nearestTriangle } from "./colorRegions";
import { splitByColor, type SplitOptions } from "./colorSplit";
import type { SplitRequest, SplitResult } from "./colorSplitWorker";
import { read3mf } from "./threemfRead";

/**
 * Separar cores pelo worker (#248): as leituras e o cálculo saem da tela principal. Dois workers: um leve (ler, grupos de cor,
 * prévia, clique na peça: pedido novo só ignora o velho, o arquivo lido fica guardado) e um para separar e cortar (cancelar encerra).
 * Sem Worker (testes) roda na mesma thread.
 */
const inline = async (req: SplitRequest, hooks: { progress?: (f: number, s: string) => void; cancelled?: () => boolean }): Promise<SplitResult> => {
  const file = read3mf(req.bytes);
  if (req.kind === "analyze") {
    const byMaterial = hasMaterialColors(file);
    return { kind: "analyze", byMaterial, clusters: byMaterial ? colorClusters(file, req.tol) : [], triangles: file.objects.reduce((n, o) => n + o.parts.reduce((m, p) => m + p.mesh.indices.length / 3, 0), 0) };
  }
  if (req.kind === "preview") return { kind: "preview", models: colorPreview(file, req.tol, req.selected) };
  if (req.kind === "pick") return { kind: "pick", hit: nearestTriangle(file, req.point) };
  const M = await getManifold();
  const out = splitByColor(M, file, { ...req.options, hooks });
  if (!req.cut.on) return { kind: "split", models: out.models, colors: out.colors, warnings: out.warnings };
  const c = req.cut.parts === 2 ? cutModels(M, out.models, req.cut.opts) : cutInParts(M, out.models, req.cut.opts, req.cut.parts);
  return { kind: "split", models: c.models, colors: out.colors, warnings: [...out.warnings, ...c.warnings] };
};
const spawn = () => new Worker(new URL("./colorSplitWorker.ts", import.meta.url), { type: "module" });
const transfer = (r: SplitRequest) => [r.bytes.buffer as ArrayBuffer];
const light = createJobRunner<SplitRequest, SplitResult>({ spawn, inline, transfer, terminateOnCancel: false });
const heavy = createJobRunner<SplitRequest, SplitResult>({ spawn, inline, transfer });

const pick = async <K extends SplitResult["kind"]>(job: Job<SplitResult>, kind: K): Promise<Extract<SplitResult, { kind: K }>> => {
  const r = await job.promise;
  if (r.kind !== kind) throw new Error("Resposta inesperada do worker.");
  return r as Extract<SplitResult, { kind: K }>;
};
const bytes = (b: Uint8Array) => b.slice();

export const analyzeAsync = (key: string, b: Uint8Array, tol: number) => pick(light({ kind: "analyze", key, bytes: bytes(b), tol }), "analyze");
export const previewAsync = (key: string, b: Uint8Array, tol: number, selected: ColorSelection[]) => pick(light({ kind: "preview", key, bytes: bytes(b), tol, selected }), "preview");
export const pickAsync = (key: string, b: Uint8Array, point: [number, number, number]) => pick(light({ kind: "pick", key, bytes: bytes(b), point }), "pick");

export function splitAsync(key: string, b: Uint8Array, options: Omit<SplitOptions, "hooks">, cut: { on: boolean; parts: number; opts: CutOptions }, onProgress?: (f: number, s: string) => void): Job<Extract<SplitResult, { kind: "split" }>> {
  const job = heavy({ kind: "split", key, bytes: bytes(b), options, cut }, onProgress);
  return { cancel: job.cancel, promise: pick(job, "split") };
}
