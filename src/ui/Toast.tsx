import { CircleAlert, CircleCheck } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Kind = "ok" | "error";
type Item = { id: number; text: string; kind: Kind; leaving: boolean };
const Ctx = createContext<(text: string, kind?: Kind) => void>(() => {});

/** `toast("Salvo.")` ou `toast("Falhou", "error")`. Empilha até 3, cada um some sozinho em 5 s. */
export const useToast = () => useContext(Ctx);

const TOAST_MS = 5000;
const LEAVE_MS = 220;
const MAX = 3;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const show = useCallback((text: string, kind: Kind = "ok") => {
    const id = nextId++;
    setItems((list) => [...list.slice(-(MAX - 1)), { id, text, kind, leaving: false }]);
    setTimeout(() => setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), TOAST_MS);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), TOAST_MS + LEAVE_MS);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind} ${t.leaving ? "leaving" : ""}`} role={t.kind === "error" ? "alert" : "status"} aria-live="polite">
            {t.kind === "error" ? <CircleAlert aria-hidden /> : <CircleCheck aria-hidden />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
