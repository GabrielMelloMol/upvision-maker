/** Atalhos globais: Cmd/Ctrl+K abre a busca, Cmd/Ctrl+N pede "novo" à página aberta, "?" abre a ajuda da tela, ⌘⌥S / Ctrl+Alt+S recolhe a barra lateral, ⌘⇧L / Ctrl+Shift+L alterna claro e escuro. */

const NEW_EVENT = "upvision:new";

export const isMac = () => /Mac/i.test(navigator.platform || navigator.userAgent);
export const modKey = () => (isMac() ? "⌘" : "Ctrl");

/** Página que tem "novo cadastro" se inscreve aqui. Retorna o cancelamento (para useEffect). */
export function onNewShortcut(fn: () => void): () => void {
  window.addEventListener(NEW_EVENT, fn);
  return () => window.removeEventListener(NEW_EVENT, fn);
}

/** Campo de digitação em foco: aí a tecla "?" é texto, não atalho. */
const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]");

type Handlers = { openPalette: () => void; openHelp?: () => void; toggleSidebar?: () => void; toggleTheme?: () => void; blockReload?: boolean };

/**
 * `blockReload`: no app instalado F5 e Ctrl/⌘+R (com ou sem Shift) recarregariam o app inteiro, e se perderia o
 * desfazer e o que não foi salvo (B15). Em desenvolvimento seguem valendo (o padrão acompanha o build).
 */
export function installShortcuts({ openPalette, openHelp, toggleSidebar, toggleTheme, blockReload = import.meta.env.PROD }: Handlers): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (blockReload && !e.altKey && (e.key === "F5" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r"))) {
      e.preventDefault();
      return;
    }
    if (toggleTheme && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.code === "KeyL") {
      e.preventDefault();
      toggleTheme();
      return;
    }
    // e.code: com Option no Mac, e.key vira "ß"
    if (toggleSidebar && (e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && e.code === "KeyS") {
      e.preventDefault();
      toggleSidebar();
      return;
    }
    if (e.key === "?" && openHelp && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && !document.querySelector("dialog[open]")) {
      e.preventDefault();
      openHelp();
      return;
    }
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k === "k") {
      e.preventDefault();
      openPalette();
    } else if (k === "n") {
      e.preventDefault(); // no WebView2, Ctrl+N abriria outra janela
      window.dispatchEvent(new Event(NEW_EVENT));
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
