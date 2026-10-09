import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");

const SCAD = `/* [Placa] */
// Largura da placa
largura = 60; // [30:5:120]
/* [Texto] */
nome = "Ana"; // 12
fonte = "Montserrat"; // font
cube([largura, 20, 2]);
translate([4, 5, 2]) linear_extrude(1.5) text(nome, size = 10, font = fonte);
`;

test("OpenSCAD personalizável: .scad do Customizer vira formulário e o OpenSCAD real renderiza com os valores (#96)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelo personalizável (OpenSCAD)");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "placa.scad", mimeType: "text/plain", buffer: Buffer.from(SCAD) });
  await expect(page.getByRole("heading", { name: "Placa", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Texto", exact: true })).toBeVisible();
  await expect(hud(page)).toContainText("60", { timeout: 90_000 });
  await page.getByLabel(/Largura da placa/).fill("100");
  await expect(hud(page)).toContainText("100", { timeout: 90_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
});

test("OpenSCAD personalizável: .scad com include <BOSL2/std.scad> renderiza com a BOSL2 embutida (#96)", async ({ page }) => {
  const src = `include <BOSL2/std.scad>\n// Lado do cubo\nlado = 30; // [10:5:80]\ncuboid([lado, lado, 10], rounding = 2, edges = "Z", anchor = BOTTOM);\n`;
  await openApp(page);
  await go(page, "Modelo personalizável (OpenSCAD)");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "cubo.scad", mimeType: "text/plain", buffer: Buffer.from(src) });
  await expect(hud(page)).toContainText("30", { timeout: 90_000 });
  await page.getByLabel(/Lado do cubo/).fill("50");
  await expect(hud(page)).toContainText("50", { timeout: 90_000 });
});
