/** Atalhos globais: Cmd/Ctrl+K abre a busca, Cmd/Ctrl+N pede "novo" à página aberta, "?" abre a ajuda da tela. */

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

export function installShortcuts({ openPalette, openHelp }: { openPalette: () => void; openHelp?: () => void }): () => void {
  const onKey = (e: KeyboardEvent) => {
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
