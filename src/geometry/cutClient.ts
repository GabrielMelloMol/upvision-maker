import { onReleaseHeavy } from "../ui/heavy";
import { getManifold } from "./manifold";
import { runCuts, type CutPlan, type CutsResult } from "./cutSequence";
import { suggestCuts, type Suggestion } from "./cutSuggest";
import type { CutReply, CutRequest } from "./cutWorker";
import type { Model } from "./types";

/**
 * Chama o corte no worker. Um pedido novo cancela o anterior do mesmo tipo (o worker é encerrado, e o WASM com ele):
 * enquanto a pessoa arrasta, só o último pedido importa. Sem Worker (testes), roda na mesma thread.
 */
export class CutCancelled extends Error {
  constructor() {
    super("Corte cancelado.");
  }
}

type Slot = { worker: Worker | null; cancel: (() => void) | null; unrelease: (() => void) | null };
const slots: Record<"cut" | "suggest", Slot> = { cut: { worker: null, cancel: null, unrelease: null }, suggest: { worker: null, cancel: null, unrelease: null } };
let seq = 0;

const copyMesh = (model: Model): Model => ({ ...model, parts: model.parts.map((p) => ({ ...p, mesh: { positions: p.mesh.positions.slice(), indices: p.mesh.indices.slice() } })) });

function drop(slot: Slot) {
  slot.worker?.terminate();
  slot.unrelease?.();
  Object.assign(slot, { worker: null, cancel: null, unrelease: null });
}

function call(kind: "cut" | "suggest", build: (id: number) => CutRequest): Promise<CutReply & { ok: true }> {
  const slot = slots[kind];
  if (slot.cancel) {
    // pedido anterior ainda rodando: encerra o worker junto (não dá para interromper o WASM no meio)
    const cancel = slot.cancel;
    drop(slot);
    cancel();
  }
  if (!slot.worker) {
    const created = new Worker(new URL("./cutWorker.ts", import.meta.url), { type: "module" });
    slot.worker = created;
    slot.unrelease = onReleaseHeavy(() => drop(slot)); // ao sair da tela o worker e o WASM dele vão embora
  }
  const worker = slot.worker;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const finish = (fn: () => void) => {
      worker.onmessage = null;
      worker.onerror = null;
      slot.cancel = null;
      fn();
    };
    slot.cancel = () => finish(() => reject(new CutCancelled()));
    worker.onmessage = (e: MessageEvent<CutReply>) => {
      const r = e.data;
      if (r.id === id) finish(() => (r.ok ? resolve(r) : reject(new Error(r.error))));
    };
    worker.onerror = (ev) => {
      finish(() => reject(new Error(ev.message || "Falha no motor de corte.")));
      drop(slot);
    };
    const req = build(id);
    worker.postMessage(req, req.model.parts.flatMap((p) => [p.mesh.positions.buffer as ArrayBuffer, p.mesh.indices.buffer as ArrayBuffer]));
  });
}

export async function cutAsync(model: Model, plan: CutPlan): Promise<CutsResult> {
  if (typeof Worker === "undefined") return runCuts(await getManifold(), model, plan);
  const r = await call("cut", (id) => ({ id, kind: "cut", model: copyMesh(model), plan }));
  return r.cut!;
}

export async function suggestAsync(model: Model): Promise<Suggestion[]> {
  if (typeof Worker === "undefined") return suggestCuts(await getManifold(), model);
  const r = await call("suggest", (id) => ({ id, kind: "suggest", model: copyMesh(model) }));
  return r.suggestions!;
}
