import { readBinaryStl } from "../geometry/stlRead";
import type { Model } from "../geometry/types";
import type { ScadRequest, ScadResponse } from "./openscad.worker";
import { parseParts, partProgram } from "./scad";

const TIMEOUT_MS = 90_000;
const SINGLE_COLOR = "#2563eb";

export class RenderCancelled extends Error {
  constructor() {
    super("Renderização cancelada.");
  }
}

let seq = 0;

/**
 * Renderiza o código num worker. Com `// @part`, cada parte vira um volume com a sua cor; sem, é uma peça só.
 * O worker é descartado ao fim (o OpenSCAD WASM não é reutilizável com segurança entre execuções).
 */
export function renderScad(code: string, name: string, opts: RenderOptions = {}): { result: Promise<Model>; cancel: () => void } {
  const parts = parseParts(code);
  const programs = parts.length ? parts.map((p) => partProgram(code, p.module)) : [code];
  const r = renderPrograms(programs, opts);
  const result = r.result.then((stls): Model => ({
    name,
    parts: stls.map((stl, i) => ({ name: parts[i]?.name ?? "Peça", color: parts[i]?.color ?? SINGLE_COLOR, mesh: readBinaryStl(stl) })),
  }));
  return { result, cancel: r.cancel };
}

/** Extras do OpenSCAD: `-D` dos parâmetros e arquivos importados pelo .scad (#96). */
export type RenderOptions = { args?: string[]; files?: [string, Uint8Array][]; timeoutMs?: number };

/** Roda cada programa numa instância do OpenSCAD e devolve um STL binário por programa. */
export function renderPrograms(programs: string[], { args, files, timeoutMs = TIMEOUT_MS }: RenderOptions = {}): { result: Promise<Uint8Array[]>; cancel: () => void } {
  const worker = new Worker(new URL("./openscad.worker.ts", import.meta.url), { type: "module" });
  const id = ++seq;
  let finish: (err: Error | null, r?: ScadResponse) => void = () => {};
  const result = new Promise<Uint8Array[]>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`O OpenSCAD demorou demais (mais de ${Math.round(timeoutMs / 1000)} s). Tente uma versão mais simples.`)), timeoutMs);
    finish = (err, r) => {
      clearTimeout(timer);
      worker.terminate();
      if (err) return reject(err);
      if (!r || !r.ok) return reject(new Error(r && !r.ok ? r.error : "Falha no OpenSCAD."));
      resolve(r.stls);
    };
    worker.onmessage = (e: MessageEvent<ScadResponse>) => e.data.id === id && finish(null, e.data);
    worker.onerror = (e) => finish(new Error(e.message || "Falha ao carregar o OpenSCAD."));
    worker.postMessage({ id, programs, args, files } satisfies ScadRequest);
  });
  return { result, cancel: () => finish(new RenderCancelled()) };
}
