import { expect, test } from "./tauri";

test("abertura (#139): impressão completa 1ª vez no dia, some quando o app monta, fade curto depois e tecla pula", async ({ page }) => {
  // o app só carrega quando o teste liberar: a abertura fica na tela para ser conferida
  let release!: () => void;
  const held = new Promise<void>((ok) => (release = ok));
  await page.route("**/src/main.tsx*", async (r) => {
    await held;
    await r.continue();
  });
  await page.goto("/", { waitUntil: "commit" }); // o load espera o main.tsx, que está segurado
  const splash = page.locator("#splash");
  await expect(splash).toHaveClass(/full/);
  await expect(splash.locator(".brand-mark.printing .layer")).toHaveCount(5);
  release();
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible({ timeout: 60_000 }); // Vite frio
  await expect(splash).toHaveCount(0); // app montou: saiu

  // mesmo dia: só o fade curto; com o app parado, é a tecla que fecha (antes da trava de 4 s)
  await page.unroute("**/src/main.tsx*");
  await page.route("**/src/main.tsx*", (r) => r.fulfill({ body: "", contentType: "text/javascript" }));
  await page.reload({ waitUntil: "commit" });
  await expect(splash).toHaveClass(/short/);
  await page.keyboard.press("Escape");
  await expect(splash).toHaveCount(0, { timeout: 1500 });
});
