/// <reference lib="webworker" />
import { colorClusters, colorPreview, hasMaterialColors, nearestTriangle, type ColorCluster, type ColorSelection } from "./colorRegions";
import { splitByColor, type ColorInfo, type SplitOptions } from "./colorSplit";
import { serveJob } from "./jobWorker";
import { JobCancelled, modelBuffers } from "./jobs";
import { getManifold } from "./manifold";
import { cutInParts, cutModels, type CutOptions } from "./planeCut";
import { read3mf, type Read3mf } from "./threemfRead";
import type { Model } from "./types";

/** Separar cores fora da tela principal (#248): ler o 3MF, achar os grupos de cor, separar e cortar. */
export type SplitRequest =
  | { kind: "analyze"; key: string; bytes: Uint8Array; tol: number }
  | { kind: "preview"; key: string; bytes: Uint8Array; tol: number; selected: ColorSelection[] }
  | { kind: "pick"; key: string; bytes: Uint8Array; point: [number, number, number] }
  | { kind: "split"; key: string; bytes: Uint8Array; options: Omit<SplitOptions, "hooks">; cut: { on: boolean; parts: number; opts: CutOptions } };
export type SplitResult =
  | { kind: "analyze"; byMaterial: boolean; clusters: ColorCluster[]; triangles: number }
  | { kind: "preview"; models: Model[] }
  | { kind: "pick"; hit: { obj: number; part: number; tri: number; color: string | null } | null }
  | { kind: "split"; models: Model[]; colors: ColorInfo[]; warnings: string[] };

let cache: { key: string; file: Read3mf } | null = null;
const opened = (key: string, bytes: Uint8Array): Read3mf => {
  if (cache?.key !== key) cache = { key, file: read3mf(bytes) }; // só relê se o arquivo mudou (ou se o worker foi reiniciado)
  return cache.file;
};

serveJob<SplitRequest, SplitResult>(async (req, hooks) => {
  const file = opened(req.key, req.bytes);
  if (req.kind === "analyze") {
    const byMaterial = hasMaterialColors(file);
    return { result: { kind: "analyze", byMaterial, clusters: byMaterial ? colorClusters(file, req.tol) : [], triangles: file.objects.reduce((n, o) => n + o.parts.reduce((m, p) => m + p.mesh.indices.length / 3, 0), 0) } };
  }
  if (req.kind === "preview") {
    const models = colorPreview(file, req.tol, req.selected);
    return { result: { kind: "preview", models }, transfer: modelBuffers(models) };
  }
  if (req.kind === "pick") {
    const hit = nearestTriangle(file, req.point);
    return { result: { kind: "pick", hit: hit && { obj: hit.obj, part: hit.part, tri: hit.tri, color: hit.color } } };
  }
  const M = await getManifold();
  const out = splitByColor(M, file, { ...req.options, hooks });
  let { models, warnings } = out;
  if (req.cut.on) {
    if (hooks.cancelled?.()) throw new JobCancelled();
    hooks.progress?.(0.95, "Cortando em partes");
    const c = req.cut.parts === 2 ? cutModels(M, models, req.cut.opts) : cutInParts(M, models, req.cut.opts, req.cut.parts);
    models = c.models;
    warnings = [...warnings, ...c.warnings];
  }
  hooks.progress?.(1, "Pronto");
  return { result: { kind: "split", models, colors: out.colors, warnings }, transfer: modelBuffers(models) };
});
