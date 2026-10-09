import { expect, go, openApp, prefsSection, test, toastWith } from "./tauri";

test("backup automático: faz o do dia ao abrir, lista em Preferências e restaura com confirmação", async ({ page, tauri }) => {
  await openApp(page);
  await expect.poll(() => [...(tauri.autoBackups.get("")?.keys() ?? [])].length).toBe(1);
  await expect(page.getByText(/sem backup/)).toHaveCount(0);

  await go(page, "Impressoras");
  tauri.db.exec("INSERT INTO printers (name, watts) VALUES ('Bambu A1', 95)");
  await go(page, "Preferências");
  await prefsSection(page, "Seus dados");
  const card = page.getByRole("region", { name: "Backup automático" });
  await card.getByRole("button", { name: "Fazer backup agora" }).click();
  await expect(toastWith(page, "Backup salvo")).toBeVisible();
  expect([...tauri.autoBackups.get("")!.keys()]).toHaveLength(1); // um por dia: substituiu o de hoje

  tauri.db.exec("DELETE FROM printers");
  await card.getByRole("button", { name: "Restaurar" }).first().click();
  await expect.poll(() => tauri.db.prepare("SELECT name FROM printers").all()).toEqual([{ name: "Bambu A1" }]);
  expect([...(tauri.autoBackups.get("") ?? new Map()).keys()].some((k) => k.startsWith("upvision-antes-"))).toBe(true); // cópia de segurança antes, visível em Backups guardados
});

test("lembrete: desligado e 9 dias sem backup mostra aviso; 'Fazer backup agora' some com ele", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.exec(`INSERT INTO secrets (key, value) VALUES ('backup_enabled', '0'), ('backup_last_at', '${new Date(Date.now() - 9 * 86_400_000).toISOString()}')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  await page.reload();
  const banner = page.locator(".banner", { hasText: "Faz 9 dias sem backup" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Fazer backup agora" }).click();
  await expect(toastWith(page, "Backup feito.")).toBeVisible();
  await expect(banner).toBeHidden();
});
