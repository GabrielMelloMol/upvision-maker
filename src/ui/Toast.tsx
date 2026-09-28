import { CircleAlert, CircleCheck } from "lucide-react";
import { logError } from "../diagnostics/log";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Kind = "ok" | "error";
export type ToastAction = { label: string; onClick: () => void };
type Item = { id: number; text: string; kind: Kind; leaving: boolean; action?: ToastAction };
const Ctx = createContext<(text: string, kind?: Kind, action?: ToastAction) => void>(() => {});

/** `toast("Salvo.")`, `toast("Falhou", "error")` ou `toast("Excluído.", "ok", { label: "Desfazer", onClick })`. Empilha até 3; some em 5 s (8 s com ação). */
export const useToast = () => useContext(Ctx);

const TOAST_MS = 5000;
const ACTION_MS = 8000;
const LEAVE_MS = 220;
const MAX = 3;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), LEAVE_MS);
  }, []);
  const show = useCallback(
    (text: string, kind: Kind = "ok", action?: ToastAction) => {
      if (kind === "error") logError("aviso", text); // o que ela viu de erro fica no registro de diagnóstico
      const id = nextId++;
      setItems((list) => [...list.slice(-(MAX - 1)), { id, text, kind, leaving: false, action }]);
      setTimeout(() => dismiss(id), action ? ACTION_MS : TOAST_MS);
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind} ${t.leaving ? "leaving" : ""}`} role={t.kind === "error" ? "alert" : "status"} aria-live="polite">
            {t.kind === "error" ? <CircleAlert aria-hidden /> : <CircleCheck aria-hidden />}
            <span>{t.text}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
