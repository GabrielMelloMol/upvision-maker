import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const ART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10" fill="#2563eb"/><circle cx="10" cy="5" r="4" fill="#facc15"/></svg>';

test("quebra-cabeça: arte vira peças com verso, moldura e aviso de peça pequena (#60)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Quebra");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Quebra-cabeça", exact: true }).click();
  await expect(page.getByText("Envie um desenho (SVG ou imagem) para ver o modelo.")).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "arte.svg", mimeType: "image/svg+xml", buffer: Buffer.from(ART) });
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Verso");
  await expect(page.getByText(/menores de 3 anos/)).toBeVisible();

  await page.getByLabel(/^Peças por linha/).fill("3");
  await page.getByRole("switch", { name: "Moldura", exact: true }).check();
  await idle(page);
  await expect(page.getByText(/menores de 3 anos/)).toHaveCount(0);
  await expect(page.locator(".legend")).toContainText("Moldura");

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
