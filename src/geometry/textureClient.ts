import { onReleaseHeavy } from "../ui/heavy";
import { getManifold } from "./manifold";
import { texturizeAll, TexturizeCancelled, type TexturizeAll, type TexturizeOptions } from "./texturize";
import { readOwnObjects } from "./ownModel";
import type { TextureReply, TextureRequest } from "./textureWorker";
import type { Model } from "./types";

/**
 * Chama a textura no worker (#222), com progresso e cancelamento. Um pedido novo cancela o anterior (o worker é encerrado, e o
 * WASM com ele: não dá para interromper o cálculo no meio). Sem Worker (testes), roda na mesma thread.
 */
export { TexturizeCancelled };
export type TextureJob = { promise: Promise<TexturizeAll>; cancel: () => void };
type Progress = (fraction: number, stage: string) => void;

let worker: Worker | null = null;
let unrelease: (() => void) | null = null;
let current: (() => void) | null = null;
let seq = 0;

const copy = (models: Model[]): Model[] => models.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p, mesh: { positions: p.mesh.positions.slice(), indices: p.mesh.indices.slice() } })) }));

function drop() {
  worker?.terminate();
  unrelease?.();
  worker = null;
  unrelease = null;
}

export function texturizeAsync(models: Model[], options: TexturizeOptions, onProgress?: Progress): TextureJob {
  current?.(); // o pedido anterior ainda rodando: cancela
  if (typeof Worker === "undefined") {
    let cancelled = false;
    const promise = getManifold().then((M) => texturizeAll(M, models, options, { progress: onProgress, cancelled: () => cancelled }));
    const cancel = () => (cancelled = true);
    current = cancel;
    return { promise, cancel };
  }
  if (!worker) {
    worker = new Worker(new URL("./textureWorker.ts", import.meta.url), { type: "module" });
    unrelease = onReleaseHeavy(drop); // ao sair da tela o worker e o WASM dele vão embora
  }
  const w = worker;
  const id = ++seq;
  let reject: (e: Error) => void = () => {};
  const promise = new Promise<TexturizeAll>((res, rej) => {
    reject = rej;
    const finish = () => {
      w.onmessage = null;
      w.onerror = null;
      if (current === cancel) current = null;
    };
    w.onmessage = (e: MessageEvent<TextureReply>) => {
      const r = e.data;
      if (r.id !== id) return;
      if (r.kind === "progress") return onProgress?.(r.fraction, r.stage);
      finish();
      if (r.kind === "done") res(r.result);
      else if (r.kind === "error") rej(r.cancelled ? new TexturizeCancelled() : new Error(r.error));
    };
    w.onerror = (ev) => {
      finish();
      drop();
      rej(new Error(ev.message || "Falha no motor de textura."));
    };
  });
  const cancel = () => {
    if (current !== cancel) return;
    current = null;
    drop(); // encerra o worker (e o WASM dele)
    reject(new TexturizeCancelled());
  };
  current = cancel;
  const req: TextureRequest = { id, models: copy(models), options };
  w.postMessage(req, req.models.flatMap((m) => m.parts.flatMap((p) => [p.mesh.positions.buffer as ArrayBuffer, p.mesh.indices.buffer as ArrayBuffer])));
  return { promise, cancel };
}

/** Lê o STL/3MF fora da tela principal (um 3MF de 17 MB leva alguns segundos). Sem Worker (testes), lê na mesma thread. */
export function readObjectsAsync(bytes: Uint8Array, name: string): Promise<Model[]> {
  if (typeof Worker === "undefined") return Promise.resolve().then(() => readOwnObjects(bytes, name));
  const w = new Worker(new URL("./textureWorker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    const done = () => w.terminate();
    w.onmessage = (e: MessageEvent<TextureReply>) => {
      const r = e.data;
      done();
      if (r.kind === "read") resolve(r.models);
      else reject(new Error(r.kind === "error" ? r.error : "Resposta inesperada ao ler o arquivo."));
    };
    w.onerror = (ev) => {
      done();
      reject(new Error(ev.message || "Falha ao ler o arquivo."));
    };
    const copyBytes = bytes.slice();
    w.postMessage({ id: 0, kind: "read", bytes: copyBytes, name } satisfies TextureRequest, [copyBytes.buffer]);
  });
}
