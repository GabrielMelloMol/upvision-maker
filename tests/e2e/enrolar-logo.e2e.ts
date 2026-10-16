import type { Page } from "@playwright/test";
import { cylinderStl } from "../../src/test/cylinderStl";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = async (page: Page) => {
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator(".viewer .busy-chip")).toHaveCount(0, { timeout: 60_000 });
};

test("enrolar o texto na lateral de um copo: na projeção reta não cabe e avisa; enrolado cabe e salva o 3MF (#245)", async ({ page, tauri }) => {
  await page.setViewportSize({ width: 1440, height: 1250 });
  await openApp(page);
  await go(page, "Nome ou logo no seu modelo");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "copo.stl", mimeType: "model/stl", buffer: Buffer.from(cylinderStl(35, 90)) });
  await expect(page.locator(".viewer .hud")).toContainText("70.0 × 70.0 × 90.0 mm", { timeout: 60_000 });
  const limpar = page.getByRole("button", { name: "Limpar ponto" });
  for (let y = 420; y <= 700 && !(await limpar.count()); y += 30)
    for (let x = 250; x <= 480 && !(await limpar.count()); x += 30) await page.locator(".viewer").click({ position: { x, y } });
  await expect(limpar).toBeVisible();

  await page.getByRole("button", { name: /Adicionar texto/ }).click();
  await page.getByLabel("Texto", { exact: true }).fill("Maria Eduarda 2026");
  await page.getByLabel("Largura").fill("110");
  await idle(page);
  // projetar: 110 mm não cabem de frente num copo de 70 mm de diâmetro
  await expect(page.getByText(/O desenho sai da peça/).first()).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Enrolar" }).click();
  await idle(page);
  await expect(page.getByText(/O desenho sai da peça/)).toHaveCount(0);
  await expect(page.getByText(/Enrolar:/)).toHaveCount(0); // o eixo em pé serve: sem aviso de fallback
  await expect(page.getByText("Rótulo desenrolado")).toBeVisible();

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("copo-decal.3mf"))).toBe(true);
});
