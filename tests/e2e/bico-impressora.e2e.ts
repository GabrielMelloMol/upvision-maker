import { expect, go, openApp, prefsSection, test } from "./tauri";

async function addPrinter(page: Parameters<typeof go>[0], name: string, watts: string, nozzle?: string) {
  await page.getByRole("button", { name: "Adicionar impressora" }).click();
  await page.getByLabel(/^Nome/).fill(name);
  await page.getByLabel(/^Potência/).fill(watts);
  if (nozzle) await page.getByRole("group", { name: "Bicos comuns" }).getByRole("button", { name: `${nozzle} mm` }).click();
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
}

test("bico da impressora: cadastro com 0,4 padrão e atalhos; a impressora das ferramentas define o bico do mapa estelar", async ({ page }) => {
  test.setTimeout(3 * 60_000);
  await openApp(page);
  await go(page, "Impressoras");
  await page.getByRole("button", { name: "Adicionar impressora" }).click();
  await expect(page.getByLabel(/^Bico \(mm\)/)).toHaveValue("0,4");
  await expect(page.getByRole("group", { name: "Bicos comuns" }).getByRole("button")).toHaveText(["0,2 mm", "0,4 mm", "0,6 mm", "0,8 mm"]);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await addPrinter(page, "Primeira 0,4", "95");
  await addPrinter(page, "Fina 0,2", "80", "0,2");
  await expect(page.getByRole("columnheader", { name: "Bico (mm)" })).toBeVisible();

  // Preferências › Ferramentas: a impressora das ferramentas mostra o bico e troca com a escolha
  await go(page, "Preferências");
  await prefsSection(page, "Ferramentas");
  await expect(page.getByText("Bico usado")).toBeVisible();
  await expect(page.getByText("0,4 mm", { exact: true })).toBeVisible(); // a primeira cadastrada
  await page.getByLabel("Tamanho da mesa pela impressora").selectOption({ label: "Fina 0,2" });
  await expect(page.getByText("0,2 mm", { exact: true })).toBeVisible();

  // Mapa estelar: abre com o bico 0,2 da impressora, estrela mínima de 0,3 mm e linhas de 0,4 mm
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("estelar");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Mapa estelar de uma data/ }).first().click();
  const bico = page.getByRole("group", { name: "Bico da impressora" });
  await expect(bico.getByRole("button", { name: "0,2 mm" })).toHaveAttribute("aria-pressed", "true");
  const facts = page.locator(".star-print-facts");
  await expect(facts).toContainText("Menor estrela: 0,3 mm");
  await expect(facts).toContainText("linhas: 0,4 mm");
  await expect(page.getByText(/menos de 0,3 mm/)).toHaveCount(0);

  // volta para a primeira impressora: o cartão das ferramentas volta a mostrar 0,4 (o mapa já aberto guarda o bico que tinha)
  await go(page, "Preferências");
  await prefsSection(page, "Ferramentas");
  await page.getByLabel("Tamanho da mesa pela impressora").selectOption({ value: "" }); // "A primeira cadastrada"
  await expect(page.getByText("0,4 mm", { exact: true })).toBeVisible();
});
