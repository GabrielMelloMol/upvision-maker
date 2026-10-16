/// <reference lib="webworker" />
import type { Hooks, JobReply, JobRequest } from "./jobs";
import { JobCancelled } from "./jobs";

/**
 * Lado do worker do cliente genérico (#248): recebe o pedido, chama `handler` com o contrato de progresso e devolve o resultado
 * (e os buffers a transferir). Erros viram resposta de erro com a mensagem.
 */
export function serveJob<Req, Res>(handler: (req: Req, hooks: Hooks) => Promise<{ result: Res; transfer?: ArrayBuffer[] }> | { result: Res; transfer?: ArrayBuffer[] }): void {
  self.onmessage = async (e: MessageEvent<JobRequest<Req>>) => {
    const { id, payload } = e.data;
    try {
      const out = await handler(payload, { progress: (fraction, stage) => self.postMessage({ id, kind: "progress", fraction, stage } satisfies JobReply<Res>) });
      self.postMessage({ id, kind: "done", result: out.result } satisfies JobReply<Res>, out.transfer ?? []);
    } catch (err) {
      self.postMessage({ id, kind: "error", error: err instanceof Error ? err.message : String(err), cancelled: err instanceof JobCancelled } satisfies JobReply<Res>);
    }
  };
}
