import { onReleaseHeavy } from "../ui/heavy";
import type { LightenOpts } from "./lighten";
import { runLighten, type LightenReply, type LightenRequest, type LightenResult, type LightenSource } from "./lightenWorker";

/** Pedido novo cancela o anterior (o worker é encerrado, e o WASM com ele). Sem Worker (testes) roda na mesma thread. */
export class LightenCancelled extends Error {
  constructor() {
    super("Cálculo cancelado.");
  }
}

let worker: Worker | null = null;
let cancel: (() => void) | null = null;
let unrelease: (() => void) | null = null;
let seq = 0;

function drop() {
  worker?.terminate();
  unrelease?.();
  worker = cancel = unrelease = null;
}

const copySource = (s: LightenSource): LightenSource =>
  s.kind === "block" ? s : { kind: "model", model: { ...s.model, parts: s.model.parts.map((p) => ({ ...p, mesh: { positions: p.mesh.positions.slice(), indices: p.mesh.indices.slice() } })) } };

export async function lightenAsync(source: LightenSource, opts: LightenOpts): Promise<LightenResult> {
  if (typeof Worker === "undefined") return runLighten(source, opts);
  if (cancel) {
    const c = cancel;
    drop();
    c();
  }
  if (!worker) {
    worker = new Worker(new URL("./lightenWorker.ts", import.meta.url), { type: "module" });
    unrelease = onReleaseHeavy(drop); // ao sair da tela o worker e o WASM dele vão embora
  }
  const w = worker;
  const id = ++seq;
  const own = copySource(source);
  return new Promise((resolve, reject) => {
    const finish = (fn: () => void) => {
      w.onmessage = null;
      w.onerror = null;
      cancel = null;
      fn();
    };
    cancel = () => finish(() => reject(new LightenCancelled()));
    w.onmessage = (e: MessageEvent<LightenReply>) => {
      const r = e.data;
      if (r.id === id) finish(() => (r.ok ? resolve(r.result) : reject(new Error(r.error))));
    };
    w.onerror = (ev) => {
      finish(() => reject(new Error(ev.message || "Falha no motor de miolo leve.")));
      drop();
    };
    const req: LightenRequest = { id, source: own, opts };
    w.postMessage(req, own.kind === "model" ? own.model.parts.flatMap((p) => [p.mesh.positions.buffer as ArrayBuffer, p.mesh.indices.buffer as ArrayBuffer]) : []);
  });
}
