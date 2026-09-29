import { expect, go, openApp, test, toastWith } from "./tauri";

test("potência da fonte copiada da etiqueta: avisa e 'Usar 95 W' corrige a conta e a impressora (#40)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.exec(`INSERT INTO printers (name, watts) VALUES ('Bambu Lab A1', 350)`);
  await go(page, "Calculadora");
  await page.getByLabel("Impressora").selectOption({ label: "Bambu Lab A1" });
  const alert = page.locator(".alert", { hasText: "parece a potência da fonte" });
  await expect(alert).toContainText("~95 W");
  await expect(page.locator(".alert", { hasText: "parece a potência da fonte" })).toHaveCount(1); // sem o aviso genérico repetido
  await alert.getByRole("button", { name: "Usar 95 W" }).click();
  await expect(toastWith(page, "atualizada: 95 W")).toBeVisible();
  await expect(alert).toHaveCount(0);
  await expect.poll(() => (tauri.db.prepare("SELECT watts FROM printers").get() as { watts: number }).watts).toBe(95);
  await page.getByRole("button", { name: "Completo" }).click();
  await expect(page.getByLabel("Potência (W)")).toHaveValue("95");
});
