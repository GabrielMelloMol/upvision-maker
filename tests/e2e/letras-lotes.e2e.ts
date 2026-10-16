import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect as baseExpect, go, openApp, test, toastWith } from "./tauri";

const expect = baseExpect.configure({ timeout: 30_000 });
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
const PRINTS = process.env.LOTES_PRINTS;
const MIN_PREVIEW_BYTES = 12_000;

test("letras de parede: passou de 36 mesas, Salvar em lotes grava vários 3MF na pasta escolhida (#225)", async ({ page, tauri }) => {
  test.slow();
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("letras para parede");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Letras para parede", exact: true }).click();
  await idle(page);
  await expect(page.getByRole("button", { name: /Salvar em lotes/ })).toHaveCount(0); // texto curto: um arquivo só
  await page.getByLabel(/^Texto/).first().fill("ABCDEFGHIJKLMNOPQRST");
  await page.getByLabel(/^Altura na parede/).fill("1000");
  await idle(page);
  const btn = page.getByRole("button", { name: /Salvar em lotes \(\d+ arquivos\)/ });
  await expect(btn).toBeVisible();
  await expect(page.getByText(/mais mesas do que o Bambu Studio e o OrcaSlicer aceitam/)).toBeVisible();
  // o botão de lotes é o principal e o 3MF único fica secundário; a lista de STL vira um botão e "ver todos"
  await expect(btn).toHaveClass(/action/);
  await expect(page.getByRole("button", { name: /Salvar 3MF único/ })).not.toHaveClass(/action/);
  await expect(page.getByRole("button", { name: /Salvar todos os STL em uma pasta/ })).toBeVisible();
  await expect(page.getByText("ver todos")).toBeVisible();
  // a prévia de 16 m de largura não fica em branco: a imagem do visualizador tem conteúdo (uma tela vazia comprime a quase nada)
  await page.waitForTimeout(1500);
  const shotBytes = (await page.locator(".viewer").screenshot()).length;
  expect(shotBytes).toBeGreaterThan(MIN_PREVIEW_BYTES);
  if (PRINTS) {
    mkdirSync(PRINTS, { recursive: true });
    await page.screenshot({ path: `${PRINTS}/01-salvar-em-lotes-v2.png` });
    await page.locator(".viewer").screenshot({ path: `${PRINTS}/02-previa-do-caso-maximo-v2.png` });
    // a área dos botões de salvar, com lotes como principal e os STL agrupados
    const area = page.locator(".card", { has: btn });
    await area.scrollIntoViewIfNeeded();
    await area.screenshot({ path: `${PRINTS}/01b-botoes-v2.png` });
  }
  const n = Number(/\((\d+) arquivos/.exec((await btn.textContent())!)![1]);
  expect(n).toBeGreaterThan(1);
  tauri.nextOpen = "/pasta";
  await btn.click();
  await expect(toastWith(page, `${n} lotes salvos em /pasta`)).toBeVisible();
  const files = [...tauri.files.keys()].filter((k) => k.startsWith("/pasta/") && k.endsWith(".3mf")).sort();
  expect(files).toHaveLength(n);
  expect(files[0]).toMatch(/-lote-1-de-\d+\.3mf$/);
});
