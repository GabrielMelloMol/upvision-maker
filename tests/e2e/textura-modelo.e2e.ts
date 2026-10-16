import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { boxStl } from "../../src/test/boxStl";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = async (page: Page) => {
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
  await expect(page.locator(".viewer .busy-chip")).toHaveCount(0, { timeout: 90_000 });
};
const box = () => ({ name: "caixa.stl", mimeType: "model/stl", buffer: Buffer.from(boxStl(60, 60, 40)) });

test("textura no seu modelo: escolhe a textura, pinta com o pincel na prévia e salva o 3MF (#222)", async ({ page, tauri }) => {
  await page.setViewportSize({ width: 1440, height: 1250 });
  await openApp(page);
  await go(page, "Textura na peça");
  await expect(page.getByRole("heading", { name: "Textura na peça" })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(box());
  await expect(page.getByText(/Peça: 60,0 × 60,0 × 40,0 mm/)).toBeVisible();
  const result = page.getByLabel("Resultado da textura");
  await expect(result).toContainText("triângulos", { timeout: 90_000 });
  await idle(page);

  await page.getByRole("button", { name: /Colmeia/ }).click();
  await expect(page.getByRole("button", { name: /Colmeia/ })).toHaveAttribute("aria-pressed", "true");
  await idle(page);

  // pincel: cada clique na peça é uma pincelada
  await page.getByRole("button", { name: "Pincel" }).click();
  await expect(page.getByText(/Nada pintado ainda/)).toBeVisible({ timeout: 90_000 });
  const marks = page.getByText(/^\d+ pinceladas?$/);
  for (let y = 380; y <= 700 && !/^[1-9]/.test((await marks.textContent()) ?? "0"); y += 40)
    for (let x = 200; x <= 560 && !/^[1-9]/.test((await marks.textContent()) ?? "0"); x += 40) await page.locator(".viewer").click({ position: { x, y } });
  await expect(marks).toHaveText(/^[1-9]/);
  await idle(page);

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("caixa-textura.3mf"))).toBe(true);
});

test("peça grande: a tela não trava, mostra o progresso, cancela e calcula de novo (#222)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1250 });
  await openApp(page);
  await go(page, "Textura na peça");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "grande.stl", mimeType: "model/stl", buffer: Buffer.from(boxStl(260, 260, 260)) });
  const bar = page.getByRole("progressbar", { name: /Progresso/ });
  await expect(bar).toBeVisible({ timeout: 60_000 });
  // a tela segue respondendo durante o cálculo: dá para escolher outra textura e ver a escolha marcada na hora
  await page.getByRole("button", { name: /Couro/ }).click();
  await expect(page.getByRole("button", { name: /Couro/ })).toHaveAttribute("aria-pressed", "true");
  await expect(bar).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText(/Cálculo cancelado/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Calcular de novo" }).click();
  await expect(page.getByLabel("Resultado da textura")).toContainText("triângulos", { timeout: 150_000 });
});

for (const scheme of ["light", "dark"] as const) {
  test(`textura no seu modelo: tela com o arquivo aberto passa no axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await go(page, "Textura na peça");
    await page.locator('input[type="file"]').first().setInputFiles(box());
    await expect(page.getByLabel("Resultado da textura")).toContainText("triângulos", { timeout: 90_000 });
    await idle(page);
    const axe = await new AxeBuilder({ page }).exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations.filter((v) => !v.nodes.every((n) => n.target.join(" ").includes("hud"))).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
}
