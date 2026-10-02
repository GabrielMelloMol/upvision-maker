import { expect, go, openApp, test, toastWith } from "./tauri";

test("organizador pela foto: ferramentas de exemplo com medida, Gridfinity em 3D e salvar 3MF (#169)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Organizador pela foto");
  await expect(page.getByRole("img", { name: /Chave de fenda: 190 × 26 mm/ })).toBeVisible();
  await page.getByRole("button", { name: "Gridfinity" }).click();
  await expect(page.getByText(/Caixa Gridfinity de \d+×\d+ casas/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("organizador-gridfinity.3mf"))).toBe(true);
});
