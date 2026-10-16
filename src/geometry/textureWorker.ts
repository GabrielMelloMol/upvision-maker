/// <reference lib="webworker" />
import { getManifold } from "./manifold";
import { texturizeAll, TexturizeCancelled, type TexturizeAll, type TexturizeOptions } from "./texturize";
import { readOwnObjects } from "./ownModel";
import type { Model } from "./types";

/** Textura fora da tela principal (#222): peça grande leva segundos e os controles não podem travar. */
export type TextureRequest = { id: number; kind?: "texturize"; models: Model[]; options: TexturizeOptions } | { id: number; kind: "read"; bytes: Uint8Array; name: string };
export type TextureReply =
  | { id: number; kind: "progress"; fraction: number; stage: string }
  | { id: number; kind: "done"; result: TexturizeAll }
  | { id: number; kind: "read"; models: Model[] }
  | { id: number; kind: "error"; error: string; cancelled?: boolean };

const buffers = (models: Model[]): ArrayBuffer[] => [...new Set(models.flatMap((m) => m.parts.flatMap((p) => [p.mesh.positions.buffer as ArrayBuffer, p.mesh.indices.buffer as ArrayBuffer])))];

self.onmessage = async (e: MessageEvent<TextureRequest>) => {
  const req = e.data;
  const { id } = req;
  try {
    if (req.kind === "read") {
      const models = readOwnObjects(req.bytes, req.name); // ler um 3MF grande (17 MB) também trava: faz aqui
      self.postMessage({ id, kind: "read", models } satisfies TextureReply, buffers(models));
      return;
    }
    const { models, options } = req;
    const M = await getManifold();
    const result = texturizeAll(M, models, options, { progress: (fraction, stage) => self.postMessage({ id, kind: "progress", fraction, stage } satisfies TextureReply) });
    self.postMessage({ id, kind: "done", result } satisfies TextureReply, buffers(result.models));
  } catch (err) {
    self.postMessage({ id, kind: "error", error: err instanceof Error ? err.message : String(err), cancelled: err instanceof TexturizeCancelled } satisfies TextureReply);
  }
};
