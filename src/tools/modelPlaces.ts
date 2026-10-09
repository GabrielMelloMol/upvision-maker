import { openWith } from "./intent";

/**
 * Modelos prontos que ganharam um lugar próprio como aba de uma ferramenta (Foto em relevo): quem abre o modelo
 * por um atalho antigo (galeria Criar, busca, "Veja também") cai na aba certa. O modelo continua no catálogo,
 * então rascunhos, variações salvas e projetos seguem valendo.
 */
const TABS: Record<string, { page: string; intent: unknown }> = {
  shadowbox: { page: "lithophane", intent: { mode: "shadowbox" } },
};

/** Para onde levar quem pediu o modelo `id`: a ferramenta (com a aba) ou, se não for aba, os Modelos prontos. */
export function openModel(id: string): string {
  const tab = TABS[id];
  if (tab) {
    openWith(tab.page, tab.intent);
    return tab.page;
  }
  openWith("models", { id });
  return "models";
}

/** Intent de busca/atalho para a página do modelo: redireciona o que virou aba. */
export function placeOf(pageId: string, intent: unknown): { pageId: string; intent: unknown } {
  const id = pageId === "models" ? (intent as { id?: string } | undefined)?.id : undefined;
  const tab = id ? TABS[id] : undefined;
  return tab ? { pageId: tab.page, intent: tab.intent } : { pageId, intent };
}
