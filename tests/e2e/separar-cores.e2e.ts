import { expect, go, openApp, test, toastWith } from "./tauri";

test("separar 3MF por cor: 3MF pintado do Bambu vira peças por cor e salva (#14)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Separar 3MF por cor");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/3mf/cubo-pintado-bambu.3mf");
  const list = page.getByLabel("Cores encontradas");
  await expect(list.getByRole("listitem")).toHaveCount(3, { timeout: 60_000 });
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("cubo-pintado-bambu-cores.3mf"))).toBe(true);
});
