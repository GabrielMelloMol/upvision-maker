/**
 * Claro/escuro (#152): Automático segue o sistema; Claro e Escuro valem só para o app e ficam lembrados neste computador.
 * No app, o tema vai para a janela nativa (Tauri): a barra de título, o vidro (Mica/vibrancy) e o
 * `prefers-color-scheme` do webview trocam juntos, então todo o CSS e as prévias 3D acompanham sem nada a mais.
 */
import { useSyncExternalStore } from "react";

const KEY = "upvision:theme";
export const THEMES = [
  ["auto", "Automático"],
  ["light", "Claro"],
  ["dark", "Escuro"],
] as const;
export type Theme = (typeof THEMES)[number][0];
const DARK = "(prefers-color-scheme: dark)";
const FADE_WAIT_MS = 300;

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.some(([t]) => t === v) ? (v as Theme) : "auto";
  } catch {
    return "auto";
  }
}

let current: Theme = storedTheme();
const listeners = new Set<() => void>();

export const isDarkNow = () => typeof matchMedia === "function" && matchMedia(DARK).matches;

/** Espera o webview trocar de esquema (ou desiste depois de FADE_WAIT_MS). */
function schemeChanged(): Promise<void> {
  return new Promise((ok) => {
    if (typeof matchMedia !== "function") return ok();
    const m = matchMedia(DARK);
    const done = () => {
      m.removeEventListener("change", done);
      ok();
    };
    m.addEventListener("change", done);
    setTimeout(done, FADE_WAIT_MS);
  });
}

async function native(t: Theme): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return; // no navegador o esquema é o do sistema
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTheme(t === "auto" ? null : t);
}

/**
 * Aplica o tema e, com `save`, lembra a escolha. A troca é instantânea e em um quadro só (#154): o cross-fade de antes
 * deixava um quadro cinza (as duas fotos meio transparentes sobre o vidro nativo) e o vidro trocava antes do resto.
 * Durante a troca as transições do CSS ficam desligadas, senão botões e cartões mudavam de cor depois do fundo.
 */
export async function applyTheme(t: Theme, { save = false } = {}): Promise<void> {
  current = t;
  if (save) {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      // só não lembra da próxima vez
    }
  }
  listeners.forEach((l) => l());
  const root = document.documentElement;
  root.classList.add("theme-switching");
  try {
    await native(t);
    await schemeChanged();
  } catch (e) {
    console.error("Tema: não deu para trocar", e);
  } finally {
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  }
}

/** Alterna entre claro e escuro a partir do que está na tela agora (botão sol/lua e ⌘⇧L). */
export const toggleTheme = () => applyTheme(isDarkNow() ? "light" : "dark", { save: true });

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Esquema efetivo (claro ou escuro) para escolher o ícone do botão. */
export function useDarkNow(): boolean {
  return useSyncExternalStore(
    (l) => {
      if (typeof matchMedia !== "function") return () => {};
      const m = matchMedia(DARK);
      m.addEventListener("change", l);
      return () => m.removeEventListener("change", l);
    },
    isDarkNow,
  );
}
