import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });

test("pote, cesto e pulseira termoformados: disco, molde e mandril em arquivos separados, com a conta e o passo a passo", async ({ page, tauri }) => {
  test.setTimeout(240_000);
  await openApp(page);
  await go(page, "Pote, cesto e pulseira termoformados");
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 90_000 });
  await expect(page.locator(".legend")).toContainText("Disco");
  await expect(page.locator(".legend")).toContainText("Molde macho");
  await expect(page.getByRole("region", { name: "Resumo da termoformagem" })).toContainText("Disco plano de");
  await expect(page.getByRole("heading", { name: "Passo a passo da termoformagem" })).toBeVisible();

  const saves = page.getByRole("button", { name: /Salvar 3MF/ });
  await saves.nth(0).click();
  await expect.poll(() => [...tauri.files.keys()].some((f) => /pote-termoformado.*\.3mf$/.test(f))).toBe(true);
  await saves.nth(1).click();
  await expect.poll(() => [...tauri.files.keys()].some((f) => /pote-molde.*\.3mf$/.test(f))).toBe(true);

  // cesto com o par de moldes
  await page.getByRole("button", { name: "Cesto", exact: true }).click();
  await page.getByRole("button", { name: "O par (prensa)" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Malha");
  await expect(page.locator(".legend")).toContainText("Molde fêmea");

  // prévia do pote pronto
  await page.getByRole("button", { name: "Pronto (não imprime)" }).click();
  await idle(page);
  await expect(page.getByText(/O pote já formado, de pé/)).toBeVisible();

  // pulseira: tira e mandril
  await page.getByRole("button", { name: "Pulseira", exact: true }).click();
  await page.getByRole("button", { name: "Mesa (o que imprime)" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Mandril");
  await expect(page.getByRole("region", { name: "Resumo da termoformagem" })).toContainText("Tira plana de");
  await page.getByRole("button", { name: "Água quente" }).click();
  await expect(page.getByRole("region", { name: "Passo a passo da termoformagem" })).toContainText("70 a 80 °C");
});

test("pote, cesto e pulseira termoformados: sem violação estrutural de acessibilidade (axe)", async ({ page }) => {
  await openApp(page);
  await go(page, "Pote, cesto e pulseira termoformados");
  await page.getByText("Opções avançadas").click();
  await idle(page);
  const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});
