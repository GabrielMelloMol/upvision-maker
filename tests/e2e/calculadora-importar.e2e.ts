import { resolve } from "node:path";
import { expect, go, openApp, test } from "./tauri";

const fixture = (name: string) => resolve("tests/fixtures/slicer", name);

test("calculadora: importa o 3MF fatiado do Bambu e preenche filamentos, tempo, peças e impressora", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO printers (name, watts) VALUES ('A1', 110);
    INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'Bambu', 120, 1000, 800, 200), ('PLA', 'Branco', 'Bambu', 110, 1000, 900, 200);`);
  await go(page, "Calculadora");
  await page.getByRole("button", { name: "Completo" }).click(); // abre no Rápido (#22)
  await page.locator(".card", { hasText: "Importar do fatiador" }).locator('input[type="file"]').setInputFiles(fixture("bambu-a1-2cores-fatiado.3mf"));

  await expect(page.getByText("Lido de")).toBeVisible();
  await expect(page.getByText("Bambu Lab A1", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Gramas").nth(0)).toHaveValue("3,79");
  await expect(page.getByLabel("Gramas").nth(1)).toHaveValue("0,55");
  await expect(page.getByLabel("Preço por kg").nth(0)).toHaveValue("120,00"); // azul casado
  await expect(page.getByLabel("Preço por kg").nth(1)).toHaveValue("110,00"); // branco casado
  await expect(page.getByLabel("Tempo de impressão")).toHaveValue("21 min");
  await expect(page.getByLabel("Peças na mesa")).toHaveValue("3");
  await expect(page.getByLabel("Potência (W)")).toHaveValue("110");
  // #41: o nome da peça vem do arquivo (3 objetos com nomes diferentes → nome do arquivo, sem extensão e sem "-")
  await expect(page.getByLabel("Nome da peça")).toHaveValue("bambu a1 2cores fatiado");

  // trocar o casamento de um filamento atualiza o preço da linha
  await page.getByLabel("Filamento cadastrado para o filamento 2").selectOption({ label: "PLA · Azul · Bambu" });
  await expect(page.getByLabel("Preço por kg").nth(1)).toHaveValue("120,00");

  // nome digitado não é trocado ao importar de novo; e vai para o rascunho de produto
  await page.getByLabel("Nome da peça").fill("Chaveiros da turma");
  await page.locator(".card", { hasText: "Importar do fatiador" }).locator('input[type="file"]').setInputFiles(fixture("bambu-a1-2cores-fatiado.3mf"));
  await expect(page.getByText("Lido de")).toBeVisible();
  await expect(page.getByLabel("Nome da peça")).toHaveValue("Chaveiros da turma");
  await page.getByRole("button", { name: "Salvar como produto" }).click();
  await expect(page.getByRole("dialog").getByLabel("Nome", { exact: true })).toHaveValue("Chaveiros da turma");
});

test("calculadora: 3MF sem fatiar explica o que fazer", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Calculadora");
  await page.getByRole("button", { name: "Completo" }).click(); // abre no Rápido (#22)
  await page.locator(".card", { hasText: "Importar do fatiador" }).locator('input[type="file"]').setInputFiles(fixture("projeto-nao-fatiado.3mf"));
  await expect(page.getByText(/ainda não foi fatiado/)).toBeVisible();
});
