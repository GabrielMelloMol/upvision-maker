import type { Page } from "@playwright/test";
import { expect, openApp, pickModel, test } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
test("capa de celular: modelos aproximados, aviso de conferir no aparelho, peça de teste", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "capa de celular", "Capa de celular (TPU)", { exact: true });
  await idle(page);
  await expect(page.getByText(/Confira as medidas no seu aparelho/)).toBeVisible();
  // a prévia da fonte mostra o nome, não o texto dos recortes dos botões
  await expect(page.getByText("direita, 40, 22 esquerda")).toHaveCount(0);
  await expect(page.getByText("Ana", { exact: true }).first()).toBeVisible();
  await page.getByLabel(/^Nome nas costas/).fill("Bia");
  await idle(page);
  const size = async () => { const m = /([\d.]+) × ([\d.]+) × /.exec((await page.locator(".viewer .hud").first().textContent()) ?? ""); return [Number(m![1]), Number(m![2])]; };
  const [, l16] = await size();
  await page.getByRole("button", { name: "iPhone 16 Pro Max (aprox.)" }).click();
  await idle(page);
  expect((await size())[1]).toBeGreaterThan(l16 + 10);
  await page.getByRole("button", { name: "Só a peça de teste (25 mm)" }).click();
  await idle(page);
  await expect(page.getByText(/Peça de teste: experimente no aparelho/)).toBeVisible();
  expect((await size())[1]).toBeLessThan(40);
  await expect(page.getByRole("button", { name: "Salvar 3MF" })).toBeEnabled();
  await page.getByRole("button", { name: "Capa inteira" }).click();
  await page.getByLabel(/^Recortes dos botões/).fill("direita, 40, 22\nlixo");
  await idle(page);
  await expect(page.getByText(/Recorte de botão ignorado/)).toBeVisible();
});
