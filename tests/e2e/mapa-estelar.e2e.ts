import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("mapa estelar de uma data: céu de São Paulo na noite de Natal, outra cidade, data inválida e ímã (#106)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("estelar");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Mapa estelar de uma data/ }).first().click();
  await idle(page);
  // placa de 120 mm de largura (a altura, 156 mm, mais o suporte de mesa dá 196 mm), placa e estrelas em 2 cores
  await expect(hud(page)).toContainText("120.0 × 196.0", { timeout: 60_000 });
  await expect(page.locator(".viewer .legend")).toContainText("Estrelas");
  await expect(page.getByText(/\d+ estrelas visíveis \(até a magnitude 4.5\) no céu de São Paulo/)).toBeVisible();

  // outra cidade: o aviso acompanha
  await page.getByLabel("Cidade", { exact: true }).selectOption({ label: "Londres" });
  await idle(page);
  await expect(page.getByText(/no céu de Londres/)).toBeVisible();

  // 30 de fevereiro não existe
  await page.getByRole("spinbutton", { name: "Mês" }).fill("2");
  await page.getByRole("spinbutton", { name: "Dia" }).fill("30");
  await expect(page.getByText(/Esse dia não existe nesse mês/)).toBeVisible();
  await page.getByRole("spinbutton", { name: "Dia" }).fill("14");
  await idle(page);
  await expect(page.getByText(/no céu de Londres/)).toBeVisible();

  // ímã atrás: aviso do encaixe
  await page.getByRole("group", { name: "Apoio" }).getByRole("button", { name: "Ímã atrás" }).click();
  await idle(page);
  await expect(page.getByText(/Encaixe um ímã de 10 mm por 2 mm/)).toBeVisible();
});
