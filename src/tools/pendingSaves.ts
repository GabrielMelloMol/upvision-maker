/**
 * Rascunhos esperando o tempo de gravar (#85). Antes de reiniciar para atualizar (#155), `flushPendingSaves()`
 * grava todos na hora: nada do que a pessoa acabou de mexer se perde.
 */
const pending = new Map<string, () => Promise<void>>();

/** Registra a gravação adiada de `key`; devolve o "já gravou / cancelou". */
export function trackSave(key: string, save: () => Promise<void>): () => void {
  pending.set(key, save);
  return () => {
    if (pending.get(key) === save) pending.delete(key);
  };
}

export async function flushPendingSaves(): Promise<void> {
  const all = [...pending.values()];
  pending.clear();
  await Promise.allSettled(all.map((s) => s()));
}
