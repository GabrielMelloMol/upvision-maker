import { expect, openApp, test } from "./tauri";

const UPDATE = { rid: 9, currentVersion: "0.2.0", version: "0.9.9", date: null, body: null, rawJson: {} };

test("com o app aberto, versão nova aparece ao voltar para a janela e a cada hora (#155)", async ({ page, tauri }) => {
  await page.clock.install();
  await openApp(page);
  const banner = page.locator(".banner", { hasText: "Nova versão v0.9.9 disponível." });
  await expect(banner).toHaveCount(0);

  // sai versão nova com o app aberto; a pessoa volta para a janela 31 min depois
  tauri.update = UPDATE;
  await page.clock.fastForward("31:00");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(banner).toBeVisible();
  await expect(banner.getByRole("button", { name: "Ver novidades" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Atualizar agora" })).toBeVisible();

  // "Depois": some nesta sessão
  await banner.getByRole("button", { name: "Depois" }).click();
  await expect(banner).toHaveCount(0);
});

test("sem voltar para a janela, a checagem de hora em hora também acha a versão nova (#155)", async ({ page, tauri }) => {
  await page.clock.install();
  await openApp(page);
  tauri.update = UPDATE;
  await page.clock.runFor("01:00:05");
  await expect(page.locator(".banner", { hasText: "Nova versão v0.9.9 disponível." })).toBeVisible();
});
