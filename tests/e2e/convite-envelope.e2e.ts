import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { expect, go, openApp, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
const file = (files: Map<string, Uint8Array>, re: RegExp) => [...files.keys()].find((f) => re.test(f));

test("convite envelope: o envelope sai com a pausa do tule, o cartão e as peças em arquivos separados", async ({ page, tauri }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await go(page, "Convite envelope");
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm");
  await expect(page.locator(".legend")).toContainText("Moldura");
  await expect(page.getByRole("heading", { name: "Passo a passo no tule" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Resumo do convite" })).toContainText("coloque o tule agora");

  await page.getByRole("button", { name: "XV anos" }).click();
  await idle(page);
  const saves = page.getByRole("button", { name: /Salvar 3MF/ });
  await saves.nth(0).click();
  await expect.poll(() => file(tauri.files, /convite-envelope.*\.3mf$/)).toBeTruthy();
  const env = unzipSync(tauri.files.get(file(tauri.files, /convite-envelope.*\.3mf$/)!)!);
  expect(strFromU8(env["Metadata/custom_gcode_per_layer.xml"])).toContain('top_z="0.8"');
  await saves.nth(1).click();
  await expect.poll(() => file(tauri.files, /convite-cartao.*\.3mf$/)).toBeTruthy();
  await saves.nth(2).click();
  await expect.poll(() => file(tauri.files, /convite-pecas.*\.3mf$/)).toBeTruthy();
});

test("convite envelope: prévia aberta e fechada, sem tule e com asas levantadas", async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await go(page, "Convite envelope");
  await idle(page);
  await page.getByRole("button", { name: "Fechado (não imprime)" }).click();
  await expect(page.getByText(/Prévia do envelope fechado/)).toBeVisible();
  await expect(page.locator(".legend")).toContainText("Borboleta");
  await page.getByRole("button", { name: "Aberto (não imprime)" }).click();
  await expect(page.getByText(/abas quase planas/)).toBeVisible();
  await page.getByRole("button", { name: "Mesa (o que imprime)" }).click();
  await page.getByRole("button", { name: "Asas levantadas" }).click();
  await idle(page);
  await page.getByLabel(/Imprimir sobre tule/).uncheck();
  await expect(page.getByRole("heading", { name: "Passo a passo sem tule" })).toBeVisible();
  await expect(page.getByText(/Asas levantadas precisam do tule/).first()).toBeVisible();
});

test("convite envelope: sem violação estrutural de acessibilidade (axe)", async ({ page }) => {
  await openApp(page);
  await go(page, "Convite envelope");
  await expect(page.getByRole("heading", { name: "Convite envelope", level: 1 })).toBeVisible();
  await idle(page);
  const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});
