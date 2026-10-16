import type { Model } from "./types";

/**
 * Trabalho pesado fora da tela principal (#222, #248): o contrato comum das ferramentas que processam o arquivo do cliente.
 * Quem calcula recebe `hooks` e chama `progress(fração, etapa)` entre as etapas; quem chama pode cancelar.
 */
export type Hooks = { progress?: (fraction: number, stage: string) => void; cancelled?: () => boolean };

export class JobCancelled extends Error {
  constructor() {
    super("Cálculo cancelado.");
  }
}

/** Uma conta em andamento: o resultado e o botão de cancelar. */
export type Job<T> = { promise: Promise<T>; cancel: () => void };

export type JobReply<Res> =
  | { id: number; kind: "progress"; fraction: number; stage: string }
  | { id: number; kind: "done"; result: Res }
  | { id: number; kind: "error"; error: string; cancelled?: boolean };
export type JobRequest<Req> = { id: number; payload: Req };

/** Buffers de todas as malhas, para passar adiante sem copiar (o mesmo buffer duas vezes na lista dá erro). */
export function modelBuffers(models: Model[]): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  for (const m of models)
    for (const p of m.parts) {
      out.add(p.mesh.positions.buffer as ArrayBuffer);
      out.add(p.mesh.indices.buffer as ArrayBuffer);
      if (p.lines) out.add(p.lines.points.buffer as ArrayBuffer);
    }
  return [...out];
}

/** Cópia das malhas para mandar ao worker (as originais ficam na tela). */
export const copyModels = (models: Model[]): Model[] =>
  models.map((m) => ({ ...m, parts: m.parts.map((p) => ({ ...p, mesh: { positions: p.mesh.positions.slice(), indices: p.mesh.indices.slice() }, lines: p.lines && { ...p.lines, points: p.lines.points.slice() } })) }));

/** Chave de um arquivo aberto (nome, tamanho e uma amostra dos bytes): o worker guarda o arquivo já lido e só relê se a chave mudar. */
export function fileKey(name: string, bytes: Uint8Array): string {
  let h = 0;
  const step = Math.max(1, Math.floor(bytes.length / 256));
  for (let i = 0; i < bytes.length; i += step) h = (Math.imul(h, 31) + bytes[i]) | 0;
  return `${name}:${bytes.length}:${h}`;
}
