import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
// 3 faixas de cor: cada uma vira uma camada
const ART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 10"><rect width="10" height="10" fill="#1f2a44"/><rect x="10" width="10" height="10" fill="#c0392b"/><rect x="20" width="10" height="10" fill="#f5efe0"/></svg>';

test("shadowbox em camadas: uma placa numerada por cor, profundidade ajustável e uma mesa por cor (#104)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("shadowbox");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Quadro em camadas/ }).click();

  await page.locator('input[type="file"]').first().setInputFiles({ name: "quadro.svg", mimeType: "image/svg+xml", buffer: Buffer.from(ART) });
  await idle(page);
  // 3 camadas, uma cor cada; a legenda mostra as 3 cores
  await expect(page.locator(".viewer .legend span")).toHaveCount(3);
  await expect(page.getByText(/1 é o fundo e a 3 fica na frente/)).toBeVisible();
  // largura 100 + 2 × 8 mm de moldura
  await expect(page.locator(".viewer .hud")).toContainText("mm");

  // profundidade maior: o aviso de profundidade total acompanha (3 × (1,2 + 3) = 13 mm; com 6 mm de profundidade, 22 mm)
  await expect(page.getByText(/profundidade total fica em 13 mm/)).toBeVisible();
  await page.getByLabel("Profundidade entre camadas").fill("6");
  await idle(page);
  await expect(page.getByText(/profundidade total fica em 22 mm/)).toBeVisible();

  // uma mesa por cor: 3 arquivos, um por placa
  await page.getByRole("button", { name: "Mesa por cor" }).click();
  tauri.nextOpen = "/pasta";
  await page.getByRole("button", { name: /Salvar uma mesa por cor \(3 arquivos\)/ }).click();
  await expect(toastWith(page, "3 mesas salvas em /pasta")).toBeVisible();
  expect([...tauri.files.keys()].filter((k) => k.startsWith("/pasta/") && k.endsWith(".3mf"))).toHaveLength(3);
});
