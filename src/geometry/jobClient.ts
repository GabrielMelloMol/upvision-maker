import { onReleaseHeavy } from "../ui/heavy";
import { JobCancelled, type Hooks, type Job, type JobReply, type JobRequest } from "./jobs";

/**
 * Cliente genérico de worker (#248): um pedido de cada vez por ferramenta. Pedido novo cancela o anterior (o worker é encerrado,
 * e o WASM com ele: não dá para interromper o cálculo no meio) e cancelar também encerra. Sem Worker (testes), roda `inline`
 * na mesma thread, com o mesmo contrato de progresso e cancelamento.
 */
export type JobRunnerOptions<Req, Res> = {
  spawn: () => Worker;
  inline: (req: Req, hooks: Hooks) => Promise<Res>;
  /** Buffers para passar ao worker sem copiar (o chamador já mandou cópias). */
  transfer?: (req: Req) => ArrayBuffer[];
  /**
   * Cancelar encerra o worker (padrão; é o único jeito de parar uma conta longa). Para pedidos leves e seguidos (arrastar um
   * deslizante) use `false`: o pedido velho só é ignorado e o worker guarda o arquivo já lido.
   */
  terminateOnCancel?: boolean;
};

export function createJobRunner<Req, Res>(o: JobRunnerOptions<Req, Res>): (req: Req, onProgress?: Hooks["progress"]) => Job<Res> {
  let worker: Worker | null = null;
  let unrelease: (() => void) | null = null;
  let current: (() => void) | null = null;
  let seq = 0;
  const drop = () => {
    worker?.terminate();
    unrelease?.();
    worker = null;
    unrelease = null;
  };
  return (req, onProgress) => {
    current?.(); // o pedido anterior ainda rodando: cancela
    if (typeof Worker === "undefined") {
      let cancelled = false;
      const promise = o.inline(req, { progress: onProgress, cancelled: () => cancelled });
      const cancel = () => (cancelled = true);
      current = cancel;
      return { promise, cancel };
    }
    if (!worker) {
      worker = o.spawn();
      unrelease = onReleaseHeavy(drop); // ao sair da tela o worker e o WASM dele vão embora
    }
    const w = worker;
    const id = ++seq;
    let reject: (e: Error) => void = () => {};
    const cancel = () => {
      if (current !== cancel) return;
      current = null;
      if (o.terminateOnCancel !== false) drop();
      else {
        w.onmessage = null;
        w.onerror = null;
      }
      reject(new JobCancelled());
    };
    const promise = new Promise<Res>((res, rej) => {
      reject = rej;
      const finish = () => {
        w.onmessage = null;
        w.onerror = null;
        if (current === cancel) current = null;
      };
      w.onmessage = (e: MessageEvent<JobReply<Res>>) => {
        const r = e.data;
        if (r.id !== id) return;
        if (r.kind === "progress") return onProgress?.(r.fraction, r.stage);
        finish();
        if (r.kind === "done") res(r.result);
        else rej(r.cancelled ? new JobCancelled() : new Error(r.error));
      };
      w.onerror = (ev) => {
        finish();
        drop();
        rej(new Error(ev.message || "Falha no motor de cálculo."));
      };
    });
    current = cancel;
    w.postMessage({ id, payload: req } satisfies JobRequest<Req>, o.transfer?.(req) ?? []);
    return { promise, cancel };
  };
}
