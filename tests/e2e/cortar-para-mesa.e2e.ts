import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { boxStl } from "../../src/test/boxStl";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = async (page: Page) => {
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator(".viewer .busy-chip")).toHaveCount(0, { timeout: 60_000 });
};
const big = (name: string) => ({ name, mimeType: "model/stl", buffer: Buffer.from(boxStl(300, 200, 100)) });

test("cortar para caber na mesa: STL de 300 mm vira 2 pedaços com junta numerada e salva o 3MF (#218)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Dividir peça grande");
  await expect(page.getByRole("heading", { name: "Dividir peça grande" })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(big("grande.stl"));
  await expect(page.getByText(/Peça: 300,0 × 200,0 × 100,0 mm/)).toBeVisible();
  const result = page.getByLabel("Resultado do corte");
  await expect(result).toContainText("2 pedaços, 1 junta, 2 mesas", { timeout: 60_000 });
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("mm");

  // encaixe de ímã: sem peça solta
  await page.getByRole("button", { name: "Ímã" }).click();
  await expect(result.getByRole("listitem")).toHaveCount(2, { timeout: 60_000 });
  await page.getByRole("button", { name: "Rabo de andorinha" }).click();
  await expect(result.getByRole("listitem")).toHaveCount(3, { timeout: 60_000 }); // dois pedaços e a chave

  // vista montada, afastada
  await page.getByRole("button", { name: "Montada" }).click();
  await page.getByLabel("Afastar os pedaços").fill("30");
  await idle(page);

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("grande-cortes.3mf"))).toBe(true);
});

for (const scheme of ["light", "dark"] as const) {
  test(`cortar para caber na mesa: tela com o arquivo aberto passa no axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await go(page, "Dividir peça grande");
    await page.locator('input[type="file"]').first().setInputFiles(big("grande.stl"));
    await expect(page.getByLabel("Resultado do corte")).toContainText("2 pedaços", { timeout: 60_000 });
    await idle(page);
    const axe = await new AxeBuilder({ page }).exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations.filter((v) => !v.nodes.every((n) => n.target.join(" ").includes("hud"))).map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
}
