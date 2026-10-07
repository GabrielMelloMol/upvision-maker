/**
 * Campos digitados e ainda não salvos (M6): atualizar reinicia o app e o que está num formulário aberto some. Registra
 * as edições da pessoa; `hasUnsavedFields()` diz se sobrou algum em formulário ou janela ainda na tela. Ferramentas
 * ficam de fora (gravam rascunho sozinhas, #85) e campos soltos (busca, filtros) também.
 */
const edited = new Set<HTMLElement>();

export function watchEdits(): () => void {
  const onInput = (e: Event) => {
    const el = e.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) edited.add(el);
  };
  document.addEventListener("input", onInput, true);
  return () => {
    document.removeEventListener("input", onInput, true);
    edited.clear();
  };
}

export function hasUnsavedFields(): boolean {
  for (const el of edited) {
    if (!el.isConnected) {
      edited.delete(el);
      continue;
    }
    if (el.closest(".tool-layout, .toolbar, [role=search]") || (el instanceof HTMLInputElement && el.type === "search")) continue;
    if (el.closest("form, dialog, .page")) return true;
  }
  return false;
}
