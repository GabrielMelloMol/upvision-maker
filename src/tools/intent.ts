/** Pedido de abertura de uma ferramenta (#139): a galeria Criar diz qual modelo abrir e a ferramenta lê ao montar. */
const pending = new Map<string, unknown>();

export function openWith(toolId: string, payload: unknown) {
  pending.set(toolId, payload);
}

export function takeIntent<T>(toolId: string): T | undefined {
  const v = pending.get(toolId) as T | undefined;
  pending.delete(toolId);
  return v;
}

/** Meus projetos (#161): abrir um projeto salvo ou continuar o rascunho ao chegar na ferramenta (lido pelo useToolState). */
export type ProjectIntent = { projectId: number } | { resume: true };
export const projectIntentKey = (toolId: string) => `project:${toolId}`;
export const openProjectIn = (toolId: string, intent: ProjectIntent) => openWith(projectIntentKey(toolId), intent);
