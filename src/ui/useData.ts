import { useCallback, useEffect, useState } from "react";
import { getDb } from "../db";
import type { Db } from "../db/types";
import { errorText, useToast } from "./Toast";

/**
 * Carrega dados do banco e expõe `reload` e `loading` (true até a 1ª leitura terminar, para mostrar skeleton).
 * Erros viram toast. `load` deve ser estável (definido fora do render ou sem depender de estado).
 */
export function useData<T>(load: (db: Db) => Promise<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const toast = useToast();
  useEffect(() => {
    let alive = true;
    getDb()
      .then(load)
      .then((d) => alive && setData(d))
      .catch((e) => toast(`Erro ao carregar dados: ${errorText(e)}`, "error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return [data, reload, loading] as const;
}
