/**
 * Uma operação de cada vez sobre os dados inteiros: restaurar, sincronizar e soltar a trava ao fechar (C1).
 * Sem isso, o tick da sincronização (ou o fechamento) exportava o banco no meio de uma restauração.
 * Não é reentrante: quem já está dentro chama as versões internas (ex.: `replaceData`), não as travadas.
 */
let tail: Promise<unknown> = Promise.resolve();

export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run;
}
