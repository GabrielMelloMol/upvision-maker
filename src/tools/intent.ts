import { useEffect, useState } from "react";

/** Pedido de abertura de uma ferramenta (#139): a galeria Criar diz qual modelo abrir e a ferramenta lê ao montar. */
/**
 * O pedido fica guardado até a tela de destino confirmar que montou. Quem lê usa `useTakenIntent` (lê durante o desenho e
 * só apaga depois de montar): o React pode refazer o desenho antes de confirmar, na mesma volta (erro passageiro) ou depois
 * (Suspense, desenho interrompido), e se o pedido fosse apagado já na leitura, o 2º desenho cairia no modelo/aba padrão,
 * sem avisar (era a Placa Pix). Um pedido que ninguém leu em INTENT_TTL_MS é descartado, para não virar modelo fantasma.
 */
const pending = new Map<string, { payload: unknown; at: number }>();
export const INTENT_TTL_MS = 10_000;

export function openWith(toolId: string, payload: unknown) {
  pending.set(toolId, { payload, at: Date.now() });
}

/** Pega e apaga na hora (para quem lê fora do desenho; as telas usam `useTakenIntent`). */
export function takeIntent<T>(toolId: string): T | undefined {
  const value = peekIntent<T>(toolId);
  pending.delete(toolId);
  return value;
}

/** Lê sem apagar (e ignora pedido velho demais). */
export function peekIntent<T>(toolId: string): T | undefined {
  const entry = pending.get(toolId);
  if (!entry) return undefined;
  if (Date.now() - entry.at > INTENT_TTL_MS) {
    pending.delete(toolId);
    return undefined;
  }
  return entry.payload as T;
}

/** A tela de destino montou: o pedido foi entregue. */
export const settleIntent = (toolId: string) => void pending.delete(toolId);

/**
 * O pedido de abertura da ferramenta, lido uma vez ao montar. Seguro contra desenho refeito: o pedido só é apagado
 * quando a tela de fato monta (efeito), não na leitura.
 */
export function useTakenIntent<T>(toolId: string): T | undefined {
  const [value] = useState(() => peekIntent<T>(toolId));
  useEffect(() => {
    settleIntent(toolId);
  }, [toolId]);
  return value;
}

/** Meus projetos (#161): abrir um projeto salvo ou continuar o rascunho ao chegar na ferramenta (lido pelo useToolState). */
export type ProjectIntent = { projectId: number } | { resume: true };
export const projectIntentKey = (toolId: string) => `project:${toolId}`;
export const openProjectIn = (toolId: string, intent: ProjectIntent) => openWith(projectIntentKey(toolId), intent);
