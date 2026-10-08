import { expect, go, openApp, test } from "./tauri";

test("destaque do mês por ocasião: o cartão da Início abre os Modelos prontos na coleção (#120)", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 3, 20, 10));
  await openApp(page);
  await page.getByRole("button", { name: /Para o Dia das Mães/ }).click();
  await expect(page.getByRole("button", { name: "Dia das Mães", pressed: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Modelo" }).getByRole("button").first()).toBeVisible();

  // a galeria Criar mostra o mesmo cartão
  await go(page, "Criar");
  await expect(page.getByRole("button", { name: /Para o Dia das Mães/ })).toBeVisible();
});

test("destaque do mês por ocasião: longe das datas o cartão não aparece (#120)", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 0, 15, 10));
  await openApp(page);
  await expect(page.getByRole("button", { name: /^Para / })).toHaveCount(0);
});
