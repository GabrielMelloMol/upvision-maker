import { useCallback, useEffect, useState } from "react";
import { getDb } from "../db";
import type { Db } from "../db/types";
import { errorText, useToast } from "./Toast";

/**
 * Carrega dados do banco e expõe `reload`, `loading` (true até a 1ª leitura terminar, para mostrar skeleton) e `error`
 * (texto do erro da última leitura, ou null): a tela mostra "Não foi possível ler" em vez de "nada cadastrado" (M15).
 * Erros também viram toast. `load` deve ser estável (definido fora do render ou sem depender de estado).
 */
export function useData<T>(load: (db: Db) => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const toast = useToast();
  useEffect(() => {
    let alive = true;
    getDb()
      .then(load)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
        toast(`Erro ao carregar dados: ${errorText(e)}`, "error");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return [data, reload, loading, error] as const;
}
