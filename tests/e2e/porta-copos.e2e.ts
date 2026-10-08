import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("porta-copos: redondo, quadrado, anel, pés e suporte para N unidades (#109)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("copos");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Porta-copos", exact: true }).click();
  await idle(page);
  // redondo de 90 mm e 4,5 mm de espessura; o desenho (nome + anel) é uma parte à parte
  await expect(hud(page)).toContainText("90.0 × 90.0 × 4.5 mm", { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Nome");
  await expect(page.getByText(/o desenho fica para baixo/)).toBeVisible();
  await expect(page.getByText(/PETG/)).toBeVisible();

  await page.getByRole("group", { name: "Forma" }).getByRole("button", { name: "Quadrado" }).click();
  await page.getByLabel(/^Tamanho \(mm\)/).fill("100");
  await idle(page);
  await expect(hud(page)).toContainText("100.0 × 100.0 × 4.5 mm");

  // suporte para 4: o conjunto fica mais largo que o porta-copos sozinho
  await page.getByLabel(/^Suporte para quantos/).fill("4");
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Suporte");
  await expect(hud(page)).not.toContainText("100.0 × 100.0 × 4.5 mm");

  // desligar "desenho para baixo" tira o aviso de virar
  await page.getByLabel("Imprimir com o desenho para baixo (face lisa)").uncheck();
  await idle(page);
  await expect(page.getByText(/o desenho fica para baixo/)).toHaveCount(0);

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
