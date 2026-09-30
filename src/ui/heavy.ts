/**
 * Liberar o que é pesado ao trocar de tela (#88). Motores WASM (manifold, vtracer, MediaPipe) não devolvem memória
 * enquanto a instância existe; cada um se registra aqui quando carrega, e o App solta todos ao mudar de página.
 * Fica num módulo mínimo para o App não puxar os motores para o carregamento inicial.
 */
const releasers = new Set<() => void>();

/** Registra quem soltar ao sair da tela; devolve o "desregistrar". */
export function onReleaseHeavy(release: () => void): () => void {
  releasers.add(release);
  return () => releasers.delete(release);
}

export function releaseHeavy(): void {
  for (const r of [...releasers]) {
    releasers.delete(r);
    try {
      r();
    } catch (e) {
      console.warn("Falha ao liberar memória:", e);
    }
  }
}
