import { useEffect, useState } from "react";
import type { Model } from "../geometry/types";
import { errorText } from "./Toast";

const DEBOUNCE_MS = 200;

/**
 * Reconstrói o modelo quando as entradas mudam (com debounce) e expõe estados de carregamento/erro.
 * `build` retorna null quando não há entrada suficiente.
 */
export function useModelBuilder(build: () => Promise<{ models: Model[]; warnings: string[] } | null>, deps: unknown[]) {
  const [models, setModels] = useState<Model[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError(null);
      } catch (e) {
        if (alive) setError(errorText(e));
      } finally {
        if (alive) setBusy(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { models, warnings, busy, error };
}
