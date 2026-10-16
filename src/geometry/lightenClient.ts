import { createJobRunner } from "./jobClient";
import type { Job } from "./jobs";
import type { LightenOpts } from "./lighten";
import { openLighten, runLighten, type LightenReply, type LightenRequest, type LightenResult, type LightenSource } from "./lightenWorker";
import { readOwnFile } from "./ownModel";

/**
 * Miolo leve pelo worker (#248): ler a peça e calcular saem da tela principal. Worker leve (ler: pedido novo só ignora o velho) e
 * pesado (calcular: pedido novo ou Cancelar encerra o worker e o WASM). Sem Worker (testes) roda na mesma thread.
 */
const inline = async (req: LightenRequest, hooks: { progress?: (f: number, s: string) => void; cancelled?: () => boolean }): Promise<LightenReply> => {
  if (req.kind === "open") return openLighten(readOwnFile(req.bytes, req.name));
  const s = req.source;
  return { kind: "run", result: await runLighten(s.kind === "block" ? { size: s.size } : readOwnFile(s.bytes, s.name), req.opts, hooks) };
};
const spawn = () => new Worker(new URL("./lightenWorker.ts", import.meta.url), { type: "module" });
const transfer = (r: LightenRequest) => (r.kind === "open" ? [r.bytes.buffer as ArrayBuffer] : r.source.kind === "file" ? [r.source.bytes.buffer as ArrayBuffer] : []);
const light = createJobRunner<LightenRequest, LightenReply>({ spawn, inline, transfer, terminateOnCancel: false });
const heavy = createJobRunner<LightenRequest, LightenReply>({ spawn, inline, transfer });

export async function openLightenAsync(key: string, bytes: Uint8Array, name: string): Promise<{ triangles: number; empty: boolean }> {
  const r = await light({ kind: "open", key, bytes: bytes.slice(), name }).promise;
  if (r.kind !== "open") throw new Error("Resposta inesperada do worker.");
  return r;
}

export function lightenAsync(source: LightenSource, opts: LightenOpts, onProgress?: (f: number, s: string) => void): Job<LightenResult> {
  const own: LightenSource = source.kind === "file" ? { ...source, bytes: source.bytes.slice() } : source;
  const job = heavy({ kind: "run", source: own, opts }, onProgress);
  return { cancel: job.cancel, promise: job.promise.then((r) => (r.kind === "run" ? r.result : Promise.reject(new Error("Resposta inesperada do worker.")))) };
}
