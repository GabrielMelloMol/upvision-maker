import { useCallback, useState } from "react";

const MAX_STEPS = 100;

type State<T> = { past: T[]; present: T; future: T[] };

/** Estado com desfazer/refazer. `set` grava um passo; `reset` troca o valor sem histórico (ex.: trocar de modelo). */
export function useHistory<T>(initial: T) {
  const [s, setS] = useState<State<T>>({ past: [], present: initial, future: [] });
  const set = useCallback((next: T | ((cur: T) => T)) => {
    setS((cur) => {
      const value = typeof next === "function" ? (next as (c: T) => T)(cur.present) : next;
      return value === cur.present ? cur : { past: [...cur.past, cur.present].slice(-MAX_STEPS), present: value, future: [] };
    });
  }, []);
  const undo = useCallback(() => setS((cur) => (cur.past.length ? { past: cur.past.slice(0, -1), present: cur.past[cur.past.length - 1], future: [cur.present, ...cur.future] } : cur)), []);
  const redo = useCallback(() => setS((cur) => (cur.future.length ? { past: [...cur.past, cur.present], present: cur.future[0], future: cur.future.slice(1) } : cur)), []);
  const reset = useCallback((value: T) => setS({ past: [], present: value, future: [] }), []);
  return { value: s.present, set, undo, redo, reset, canUndo: s.past.length > 0, canRedo: s.future.length > 0 };
}
