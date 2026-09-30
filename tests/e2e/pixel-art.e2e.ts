import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });

test("Pixel art: grade em branco, pintar arrastando e gerar mosaico e quebra-cabeça (#95)", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openApp(page);
  await go(page, "Pixel art");
  await page.getByLabel(/^Pixels no lado maior/).fill("8");
  await page.getByRole("button", { name: "Começar em branco" }).click();
  const canvas = page.getByRole("img", { name: /Grade de pixels, 8 × 8/ });
  await expect(canvas).toBeVisible();
  // pinta a primeira linha inteira arrastando
  const b = (await canvas.boundingBox())!;
  const cell = b.width / 8;
  await page.mouse.move(b.x + cell / 2, b.y + cell / 2);
  await page.mouse.down();
  for (let c = 1; c < 8; c++) await page.mouse.move(b.x + cell * (c + 0.5), b.y + cell / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByLabel("Legenda das cores")).toContainText("8 pixels");
  if (process.env.PIXEL_SHOTS)
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.screenshot({ path: `${process.env.PIXEL_SHOTS}/pixel-${scheme}.png`, fullPage: true });
    }
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "3D", exact: true }).click();
  await idle(page);
  // 8 pixels de 6 mm + borda de 2 mm dos dois lados
  await expect(page.locator(".viewer .hud")).toContainText("52.0 × 10.0", { timeout: 90_000 });
  await page.getByRole("button", { name: "Quebra-cabeça" }).click();
  await idle(page);
  await expect(page.getByRole("button", { name: /STL bandeja/ })).toBeVisible();
});
