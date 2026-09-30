import { expect, go, openApp, test } from "./tauri";

test("prévia 3D pelo teclado e leitor de tela (#144): nome com medidas e partes; setas giram, 0 volta", async ({ page }) => {
  test.slow(); // prévia 3D
  await openApp(page);
  await go(page, "Chaveiros");
  await page.getByLabel("Texto", { exact: true }).fill("Ana");
  const viewer = page.getByRole("img", { name: /^Prévia 3D: .* mm; partes/ });
  await expect(viewer).toBeVisible({ timeout: 60_000 });
  await expect(viewer).toHaveAttribute("aria-keyshortcuts", /ArrowLeft/);
  await page.waitForTimeout(8000); // chegada e giro automático de boas-vindas acabam
  await viewer.focus();
  await page.keyboard.press("0");
  await page.waitForTimeout(900);
  const before = await viewer.locator("canvas").screenshot();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  expect(Buffer.compare(before, await viewer.locator("canvas").screenshot())).not.toBe(0);
});
