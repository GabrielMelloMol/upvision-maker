import type { Page } from "@playwright/test";
import { expect as baseExpect, go, openApp, test, toastWith } from "./tauri";

// o kit monta 41 peças (a rosca usa o gerador do Estojo) e leva alguns segundos
const expect = baseExpect.configure({ timeout: 60_000 });
const idle = async (page: Page) => {
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0);
  await expect(page.locator(".viewer .busy-chip")).toHaveCount(0);
};

test("kit de testes: monta o kit, salva o PDF e o 3MF, lança a folga da rosca e o Estojo já abre com ela (#247)", async ({ page, tauri }) => {
  test.setTimeout(240_000);
  await openApp(page);
  await go(page, "Kit de testes");
  await expect(page.getByRole("heading", { name: "Kit de testes" })).toBeVisible();
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("×");
  await expect(page.getByText(/O kit tem 41 peças em \d+ mesas/)).toBeVisible();
  await expect(page.getByText(/Mesa 1 · PLA ou PETG/).first()).toBeVisible();
  await expect(page.getByText(/TPU 95A/).first()).toBeVisible();

  tauri.files.clear();
  await page.getByRole("button", { name: /Salvar a folha de conferência \(PDF\)/ }).click();
  await expect(toastWith(page, "Folha de conferência salva em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".pdf"))).toBe(true);

  // a última mesa é a do TPU (capa): o seletor troca a prévia e o que vai para o arquivo
  const plateButtons = page.getByRole("group", { name: "Mesa do kit" }).getByRole("button");
  await plateButtons.last().click();
  await expect(page.getByText(/· TPU 95A · 5 peças/)).toBeVisible();
  await idle(page);

  tauri.files.clear();
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);

  // lançar o resultado: a rosca nº 4 (folga 0,40) vira o padrão
  await page.getByLabel("Peça escolhida: Folga da rosca").selectOption("4");
  await expect(toastWith(page, "Folga da rosca: 0,40 mm agora é o seu padrão.")).toBeVisible();
  await expect(page.getByText(/em uso: 0,40 mm \(o padrão era 0,35\)/)).toBeVisible();

  // o Estojo com tampa de rosca já nasce com a folga validada
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Estojo");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Estojo com tampa de rosca/ }).click();
  await expect(page.getByLabel(/^Folga \(/)).toHaveValue("0.4");
});
