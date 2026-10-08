import { useEffect, useMemo, useState } from "react";
import type { Model } from "../geometry/types";
import { errorText } from "./Toast";

const DEBOUNCE_MS = 200;

/**
 * Reconstrói o modelo quando as entradas mudam (com debounce) e expõe estados de carregamento/erro.
 * `build` retorna null quando não há entrada suficiente.
 * `busy` já fica true no instante em que uma entrada muda (não só depois do debounce): o modelo na tela
 * é o antigo até a reconstrução terminar, então salvar precisa esperar.
 */
export function useModelBuilder<V = undefined>(build: () => Promise<{ models: Model[]; warnings: string[]; pauses?: number[]; view?: V } | null>, deps: unknown[]) {
  const [models, setModels] = useState<Model[]>([]);
  const [pauses, setPauses] = useState<number[]>([]);
  /** Dado extra da reconstrução (ex.: a vista de cima das alças do Chaveiro). */
  const [view, setView] = useState<V | undefined>(undefined);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // novo objeto a cada mudança de entrada; `built` guarda o da última reconstrução concluída
  // deps vêm de quem chama (igual ao efeito abaixo)
  // eslint-disable-next-line react-hooks/use-memo, react-hooks/exhaustive-deps
  const token = useMemo(() => ({}), deps);
  const [built, setBuilt] = useState<object | null>(null);
  const stale = token !== built && models.length > 0;

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        // cede um quadro para o indicador de carregamento aparecer antes do cálculo (que roda nesta thread)
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const r = await build();
        if (!alive) return;
        setModels(r?.models ?? []);
        setWarnings(r?.warnings ?? []);
        setPauses(r?.pauses ?? []);
        setView(r?.view);
        setError(null);
      } catch (e) {
        if (alive) setError(errorText(e));
      } finally {
        if (alive) {
          setBusy(false);
          setBuilt(token);
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { models, warnings, pauses, view, busy: busy || stale, error };
}
