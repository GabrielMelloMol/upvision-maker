import { useEffect, useRef, useState } from "react";
import type { Hooks, Job } from "../geometry/jobs";
import { JobCancelled } from "../geometry/jobs";

export const CANCELLED_TEXT = "Cálculo cancelado. Mude uma opção ou toque em Calcular de novo.";

/**
 * Controle de um cálculo pesado numa ferramenta (#222, #248): progresso por etapa, Cancelar e "Calcular de novo". Mudar qualquer
 * entrada (`resetKey`) cancela o cálculo em andamento na hora. Use `run` dentro do `useModelBuilder`; mostre com `<WorkProgress>`.
 */
export function useJobControl(resetKey: unknown[]) {
  const [progress, setProgress] = useState<{ fraction: number; stage: string } | null>(null);
  const [rev, setRev] = useState(0);
  const job = useRef<Job<unknown> | null>(null);
  const halt = useRef(false); // "Cancelar" tocado antes de o cálculo começar (na espera de 0,2 s depois de mudar uma opção)
  const run = useRef(0);

  useEffect(() => {
    job.current?.cancel();
    job.current = null;
    halt.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...resetKey, rev]);

  return {
    progress,
    /** Entra no `deps` do `useModelBuilder` para o "Calcular de novo" refazer a conta. */
    rev,
    /** Roda o cálculo (`start` recebe o callback de progresso). Rejeita com a mensagem de cancelado quando cancelam. */
    async run<T>(start: (onProgress: Hooks["progress"]) => Job<T>): Promise<T> {
      if (halt.current) {
        halt.current = false;
        throw new Error(CANCELLED_TEXT);
      }
      const mine = ++run.current;
      setProgress({ fraction: 0, stage: "Começando" });
      const running = start((fraction, stage) => run.current === mine && setProgress({ fraction, stage }));
      job.current = running as Job<unknown>;
      try {
        return await running.promise;
      } catch (e) {
        if (e instanceof JobCancelled) throw new Error(CANCELLED_TEXT, { cause: e });
        throw e;
      } finally {
        if (run.current === mine) setProgress(null);
        if (job.current === (running as Job<unknown>)) job.current = null;
      }
    },
    cancel() {
      if (job.current) job.current.cancel();
      else halt.current = true;
    },
    retry: () => setRev((n) => n + 1),
  };
}
export type JobControl = ReturnType<typeof useJobControl>;
