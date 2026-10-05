/** Tempos do protocolo de sincronização; os testes encurtam (src/test/setup.ts). */
export const syncTuning = {
  /** Depois de pegar a trava, espera a nuvem espalhar e confere se ainda é minha (M5). */
  settleMs: 3000,
  /** De quanto em quanto tempo a faixa sincroniza. */
  tickMs: 60_000,
};
