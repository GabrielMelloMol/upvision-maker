import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect as baseExpect, go, openApp, test, toastWith } from "./tauri";

const expect = baseExpect.configure({ timeout: 30_000 });
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
const PRINTS = process.env.LOTES_PRINTS;

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
  if (PRINTS) {
    mkdirSync(PRINTS, { recursive: true });
    await btn.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${PRINTS}/01-salvar-em-lotes.png` });
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
