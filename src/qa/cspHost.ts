/**
 * Coloca no CSP do app só o endereço do Worker de sugestões do build de lançamento (B28). O tauri.conf.json do
 * repositório não libera nenhum `*.workers.dev` (qualquer Worker de qualquer pessoa receberia conexões do app); o
 * passo de lançamento (scripts/csp-host.ts, no release.yml) acrescenta o host exato de `FEEDBACK_URL`.
 */
export function cspWithFeedback(csp: string, feedbackUrl: string): string {
  const without = csp.replace(/\s+https:\/\/\*\.workers\.dev/g, "");
  let origin: string;
  try {
    const url = new URL(feedbackUrl.trim());
    if (url.protocol !== "https:") return without;
    origin = url.origin;
  } catch {
    return without;
  }
  if (without.split(/[\s;]+/).includes(origin)) return without; // já está
  return without.replace(/connect-src([^;]*)/, (_all, rest: string) => `connect-src${rest.trimEnd()} ${origin}`);
}
