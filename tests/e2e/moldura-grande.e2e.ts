import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("moldura grande: divide pela mesa em peças com encaixe, garras e gancho, e volta a uma peça só (#108)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("moldura grande");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Moldura grande dividida", exact: true }).click();
  await idle(page);

  // pôster de 50 × 70 cm: passa da mesa, então sai em várias peças com cauda de andorinha e avisa das mesas
  await expect(page.getByRole("status").filter({ hasText: /cauda de andorinha/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("status").filter({ hasText: /Garras/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Gancho/ })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /mais de uma mesa de impressão/ })).toBeVisible();
  await expect(page.locator(".legend")).toContainText("Canto");

  // arte pequena: cabe na mesa e vira uma peça só, sem o aviso de divisão
  await page.getByLabel(/^Largura da arte/).fill("150");
  await page.getByLabel(/^Altura da arte/).fill("190");
  await idle(page);
  await expect(page.getByRole("status").filter({ hasText: /cauda de andorinha/ })).toHaveCount(0);
  await expect(page.locator(".legend")).toContainText("Cantos");

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
