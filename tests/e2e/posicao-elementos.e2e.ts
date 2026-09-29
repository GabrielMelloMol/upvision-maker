import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("cartão de visita: arrastar o QR no gizmo, centralizar e trocar a arrumação (#79)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Cartão");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Cartão de visita", exact: true }).click();
  await idle(page);
  const els = page.locator(".gizmo-element");
  await expect(els).toHaveCount(2, { timeout: 60_000 });
  // arrasta o QR bem para cima: sai da borda e o app avisa
  await els.nth(1).scrollIntoViewIfNeeded();
  const box = (await els.nth(1).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - box.height * 0.8, { steps: 8 });
  await page.mouse.up();
  await idle(page);
  await expect(page.getByText(/QR: passa da borda/)).toBeVisible();
  await page.getByRole("button", { name: "Centralizar tudo" }).click();
  await idle(page);
  await expect(page.getByText(/QR: passa da borda/)).toHaveCount(0);
  await page.getByRole("button", { name: "QR à esquerda" }).click();
  await idle(page);
  const [t, q] = [await els.nth(0).boundingBox(), await els.nth(1).boundingBox()];
  expect(q!.x + q!.width).toBeLessThan(t!.x);
});
