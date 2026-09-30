import type { CDPSession, Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { expect, go, installTauriMock, openApp, test } from "../e2e/tauri";

/**
 * Desempenho (#88): abertura a frio e memória com a CPU 4× mais lenta (aproxima um notebook i3 comum).
 * Memória: heap JS (depois de coletar o lixo) e o total dos processos do navegador de teste (RSS),
 * que é o que o Gerenciador de Tarefas mostra para o WebView2. Resultado em test-results/perf.json.
 */
const CPU_SLOWDOWN = 4;
const RUNS = 3;
const MB = 1024 * 1024;
const results: Record<string, number> = {};

async function slowCpu(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  await cdp.send("Performance.enable");
  return cdp;
}

async function heapMb(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Math.round(metrics.find((m) => m.name === "JSHeapUsedSize")!.value / MB);
}

/** RSS (MB) dos processos do Chromium do Playwright: total e só os de página (renderer, onde ficam JS, workers e WASM). */
function rssMb(): { total: number; page: number } {
  const lines = execSync("ps -A -o rss=,command=", { encoding: "utf8" })
    .split("\n")
    .filter((l) => /ms-playwright|chrome-headless-shell/.test(l));
  const sum = (ls: string[]) => Math.round(ls.reduce((s, l) => s + (Number(l.trim().split(/\s+/)[0]) || 0), 0) / 1024);
  return { total: sum(lines), page: sum(lines.filter((l) => l.includes("--type=renderer"))) };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test("abertura a frio até a barra lateral aparecer", async ({ browser }) => {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext(); // sem cache: a frio
    const page = await context.newPage();
    await installTauriMock(page);
    await slowCpu(page);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
    times.push(Math.round(await page.evaluate(() => performance.now())));
    await context.close();
  }
  results.aberturaMs = median(times);
  console.log(`abertura (CPU ${CPU_SLOWDOWN}× mais lenta): ${times.join(", ")} ms → mediana ${results.aberturaMs} ms`);
});

test("memória: parado, em cada ferramenta e depois de voltar para o Início", async ({ page }) => {
  const cdp = await slowCpu(page);
  await openApp(page);
  await page.waitForTimeout(2000);
  const at = async (label: string) => {
    await page.waitForTimeout(1500);
    const heap = await heapMb(cdp);
    const rss = rssMb();
    Object.assign(results, { [`heap_${label}`]: heap, [`pagina_${label}`]: rss.page, [`total_${label}`]: rss.total });
    console.log(`${label.padEnd(18)} heap JS ${String(heap).padStart(4)} MB · página ${String(rss.page).padStart(4)} MB · navegador ${rss.total} MB`);
  };
  const home = async (label: string) => {
    await go(page, "Início");
    await at(`${label}_saiu`);
  };
  await at("parado");

  await go(page, "Imagem → SVG");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/logo.jpg");
  await page.getByRole("button", { name: /^Aplicar/ }).click();
  await expect(page.getByText("Resultado atualizado.")).toBeVisible();
  await at("svg");
  await home("svg");

  await go(page, "Litofania e quadro");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/foto-pessoa.jpg");
  await expect(page.getByRole("img", { name: "Simulação da litofania contra a luz" })).toBeVisible();
  await at("litofania");
  await home("litofania");

  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Chaveiro giratório");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Chaveiro giratório", exact: true }).click();
  await expect(page.locator(".viewer .hud")).toContainText("mm");
  await at("modelos");
  await home("modelos");
  writeFileSync("test-results/perf.json", JSON.stringify(results, null, 2));
});
