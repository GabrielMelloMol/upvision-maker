import { useCallback, useEffect, useState } from "react";

const KEY = "upvision:sidebar";
/** Abaixo disso a barra lateral vira faixa de ícones sozinha (#139). */
export const NARROW_QUERY = "(max-width: 1099px)";

const narrowNow = () => typeof matchMedia === "function" && matchMedia(NARROW_QUERY).matches;
function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === "rail";
  } catch {
    return false; // sem armazenamento: começa aberta
  }
}

/** Barra lateral recolhida em faixa de ícones: escolha da pessoa (lembrada) ou janela estreita. */
export function useSidebarRail() {
  const [pinned, setPinned] = useState(stored);
  const [narrow, setNarrow] = useState(narrowNow);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(NARROW_QUERY);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const toggle = useCallback(() => {
    setPinned((p) => {
      try {
        localStorage.setItem(KEY, p ? "full" : "rail");
      } catch {
        // só não lembra da próxima vez
      }
      return !p;
    });
  }, []);
  return { rail: pinned || narrow, narrow, toggle };
}
