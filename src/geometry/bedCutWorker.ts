/// <reference lib="webworker" />
import { bedCut, type BedCutOptions, type BedCutResult } from "./bedCut";
import { meshBounds } from "./bounds";
import { loadFont } from "./fonts";
import { serveJob } from "./jobWorker";
import { modelBuffers } from "./jobs";
import { getManifold } from "./manifold";
import { readOwnFile } from "./ownModel";
import type { Model } from "./types";

/** Cortar para a mesa fora da tela principal (#248): ler o arquivo grande e cortar em pedaços. */
export type BedCutRequest =
  | { kind: "open"; key: string; bytes: Uint8Array; name: string }
  | { kind: "cut"; key: string; bytes: Uint8Array; name: string; options: BedCutOptions };
export type BedCutReply = { kind: "open"; dims: [number, number, number] } | { kind: "cut"; result: BedCutResult };

let cache: { key: string; model: Model } | null = null;
const opened = (key: string, bytes: Uint8Array, name: string): Model => {
  if (cache?.key !== key) cache = { key, model: readOwnFile(bytes, name) };
  return cache.model;
};

serveJob<BedCutRequest, BedCutReply>(async (req, hooks) => {
  hooks.progress?.(0.01, "Lendo o arquivo");
  const model = opened(req.key, req.bytes, req.name);
  if (req.kind === "open") {
    const b = meshBounds(model.parts.map((p) => p.mesh));
    return { result: { kind: "open", dims: b ? [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] : [0, 0, 0] } };
  }
  const result = bedCut(await getManifold(), model, req.options, req.options.numbers ? await loadFont("hanken") : null, hooks);
  return { result: { kind: "cut", result }, transfer: [...modelBuffers(result.models), ...modelBuffers(result.assembled)] };
});
