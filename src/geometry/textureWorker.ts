/// <reference lib="webworker" />
import { getManifold } from "./manifold";
import { serveJob } from "./jobWorker";
import { modelBuffers } from "./jobs";
import { readOwnObjects } from "./ownModel";
import { texturizeAll, type TexturizeAll, type TexturizeOptions } from "./texturize";
import type { Model } from "./types";

/** Textura fora da tela principal (#222): peça grande leva segundos e os controles não podem travar. */
export type TextureRequest = { kind: "texturize"; models: Model[]; options: TexturizeOptions } | { kind: "read"; bytes: Uint8Array; name: string };
export type TextureResult = { kind: "texturize"; result: TexturizeAll } | { kind: "read"; models: Model[] };

serveJob<TextureRequest, TextureResult>(async (req, hooks) => {
  if (req.kind === "read") {
    const models = readOwnObjects(req.bytes, req.name); // ler um 3MF grande (17 MB) também trava: faz aqui
    return { result: { kind: "read", models }, transfer: modelBuffers(models) };
  }
  const M = await getManifold();
  const result = texturizeAll(M, req.models, req.options, hooks);
  return { result: { kind: "texturize", result }, transfer: modelBuffers(result.models) };
});
