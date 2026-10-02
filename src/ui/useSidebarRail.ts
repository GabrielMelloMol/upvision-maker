import { useCallback, useEffect, useState } from "react";

const KEY = "upvision:sidebar";
/** Abaixo disso a barra lateral começa recolhida em faixa de ícones (#139). */
const NARROW_QUERY = "(max-width: 1099px)";

const narrowNow = () => typeof matchMedia === "function" && matchMedia(NARROW_QUERY).matches;
function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === "rail";
  } catch {
    return false; // sem armazenamento: começa aberta
  }
}

/**
 * Barra lateral recolhida em faixa de ícones (#167): só o botão e o atalho abrem e fecham. A escolha fica lembrada;
 * janela estreita começa recolhida, e abrir nela vale até a janela mudar de largura.
 */
export function useSidebarRail() {
  const [pinned, setPinned] = useState(stored);
  const [narrow, setNarrow] = useState(narrowNow);
  const [narrowOpen, setNarrowOpen] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(NARROW_QUERY);
    const on = () => {
      setNarrow(m.matches);
      setNarrowOpen(false);
    };
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const toggle = useCallback(() => {
    if (narrow) return setNarrowOpen((o) => !o);
    setPinned((p) => {
      try {
        localStorage.setItem(KEY, p ? "full" : "rail");
      } catch {
        // só não lembra da próxima vez
      }
      return !p;
    });
  }, [narrow]);
  return { rail: narrow ? !narrowOpen : pinned, toggle };
}
