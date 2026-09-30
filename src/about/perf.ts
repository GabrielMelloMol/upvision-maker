/**
 * Números de desempenho para o "Copiar informações" (#88): tempo até a 1ª tela aparecer (desde que a janela começou
 * a carregar a página; a partida do próprio WebView fica de fora) e a memória JS, quando o motor informa (WebView2 sim,
 * Safari/WKWebView não). O total de memória do app se lê no Gerenciador de Tarefas (docs/QA-windows.md).
 */
type PerfSource = { now: () => number; memory?: { usedJSHeapSize: number } };

let startupMs: number | null = null;

/** Chamado uma vez, quando a 1ª tela montou. */
export function markStartup(p: PerfSource = performance): void {
  startupMs ??= p.now();
}

export function perfLine(p: PerfSource = performance as PerfSource, startup = startupMs): string | null {
  const parts = [
    startup !== null ? `Abertura: ${(startup / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s` : null,
    p.memory ? `memória JS: ${Math.round(p.memory.usedJSHeapSize / 1024 / 1024)} MB` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
