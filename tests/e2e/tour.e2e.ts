import { expect, go, openApp, prefsSection, test } from "./tauri";

test("tour guiado (#158): 1ª visita acende o alvo, Enter/Voltar/Pular, passo interativo, não reaparece, Rever e Reiniciar", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem("upvision:tours", "[]")); // o harness desliga as dicas; aqui liga
  await page.reload();
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(nav).toBeVisible({ timeout: 60_000 });

  // Início: balão com contador, Enter avança, Voltar volta, Pular fecha
  const tour = page.getByRole("dialog", { name: /seções do app/ });
  await expect(tour).toBeVisible({ timeout: 15_000 });
  await expect(tour).toContainText("1 de 4");
  await expect(page.locator(".tour-spot")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /Atalhos/ })).toContainText("2 de 4");
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.getByRole("dialog", { name: /seções do app/ })).toBeVisible();
  await page.getByRole("button", { name: "Pular", exact: true }).click();
  await expect(page.locator(".tour-pop")).toHaveCount(0);

  // não reaparece
  await page.reload();
  await expect(nav).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator(".tour-pop")).toHaveCount(0);

  // Criar: o 1º passo espera a pessoa digitar de verdade; Esc sai
  await go(page, "Criar");
  await expect(page.getByRole("dialog", { name: /Digite o que quer fazer/ })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.type("chaveiro"); // o foco já está na busca
  await expect(page.getByRole("dialog", { name: /filtre/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tour-pop")).toHaveCount(0);

  // Rever pelo ?, e Reiniciar dicas em Ajustes
  await page.getByRole("button", { name: /^Ajuda/ }).first().click();
  await page.getByRole("button", { name: "Rever o tour" }).click();
  await expect(page.getByRole("dialog", { name: /Digite o que quer fazer/ })).toBeVisible();
  await page.getByRole("button", { name: "Fechar o tour" }).click();
  await go(page, "Ajustes");
  await prefsSection(page, "Aparência");
  await page.getByRole("button", { name: "Reiniciar dicas" }).click();
  await go(page, "Início");
  await expect(page.getByRole("dialog", { name: /seções do app/ })).toBeVisible({ timeout: 15_000 });
});
