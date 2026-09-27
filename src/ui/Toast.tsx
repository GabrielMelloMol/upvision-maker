import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { text: string; kind: "ok" | "error" };
const Ctx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {});

export const useToast = () => useContext(Ctx);

const TOAST_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const show = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    setToast({ text, kind });
    setTimeout(() => setToast((t) => (t?.text === text ? null : t)), TOAST_MS);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.kind}`} role="status" aria-live="polite">
          {toast.text}
        </div>
      )}
    </Ctx.Provider>
  );
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
