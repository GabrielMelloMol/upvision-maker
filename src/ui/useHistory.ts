import { useCallback, useState } from "react";

const MAX_STEPS = 100;

type State<T> = { past: T[]; present: T; future: T[] };

/** Espera entre mudanças do mesmo campo para ainda contar como um passo só (digitar "Ana" = 1 desfazer). */
export const COALESCE_MS = 800;

/**
 * Estado com desfazer/refazer. `set` grava um passo; `reset` troca o valor sem histórico (ex.: trocar de modelo).
 * Com `key` (ex.: nome do campo), mudanças seguidas na mesma chave em menos de COALESCE_MS viram um passo só.
 */
export function useHistory<T>(initial: T | (() => T)) {
  const [s, setS] = useState<State<T> & { key?: string; at?: number }>(() => ({ past: [], present: typeof initial === "function" ? (initial as () => T)() : initial, future: [] }));
  const set = useCallback((next: T | ((cur: T) => T), key?: string) => {
    setS((cur) => {
      const value = typeof next === "function" ? (next as (c: T) => T)(cur.present) : next;
      if (value === cur.present) return cur;
      const now = Date.now();
      if (key && cur.key === key && cur.at !== undefined && now - cur.at < COALESCE_MS) return { ...cur, present: value, future: [], at: now };
      return { past: [...cur.past, cur.present].slice(-MAX_STEPS), present: value, future: [], key, at: now };
    });
  }, []);
  const undo = useCallback(() => setS((cur) => (cur.past.length ? { past: cur.past.slice(0, -1), present: cur.past[cur.past.length - 1], future: [cur.present, ...cur.future] } : cur)), []);
  const redo = useCallback(() => setS((cur) => (cur.future.length ? { past: [...cur.past, cur.present], present: cur.future[0], future: cur.future.slice(1) } : cur)), []);
  const reset = useCallback((value: T) => setS({ past: [], present: value, future: [] }), []);
  return { value: s.present, set, undo, redo, reset, canUndo: s.past.length > 0, canRedo: s.future.length > 0 };
}
