import { expect, test } from "./tauri";

test("abertura (#139): impressão completa 1ª vez no dia, some quando o app monta, fade curto depois e tecla pula", async ({ page }) => {
  // segura o app um pouco para dar tempo de ver a abertura
  await page.route("**/src/main.tsx*", async (r) => {
    await new Promise((ok) => setTimeout(ok, 700));
    await r.continue();
  });
  await page.goto("/");
  const splash = page.locator("#splash");
  await expect(splash).toHaveClass(/full/);
  await expect(splash.locator(".brand-mark.printing .layer")).toHaveCount(5);
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
  await expect(splash).toHaveCount(0); // app montou: saiu

  await page.reload();
  await expect(splash).toHaveClass(/short/); // mesmo dia: só o fade
  await page.keyboard.press("Escape"); // pular
  await expect(splash).toHaveClass(/out/);
  await expect(splash).toHaveCount(0);
});
