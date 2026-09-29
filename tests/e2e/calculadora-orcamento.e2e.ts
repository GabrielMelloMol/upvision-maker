import { expect, go, openApp, test } from "./tauri";

test("calculadora → orçamento (#28): dois cálculos viram itens avulsos com custo e minutos, e o pedido convertido herda", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO settings (id, data) VALUES (1, '{"failurePct":0}') ON CONFLICT(id) DO UPDATE SET data = excluded.data;`);
  await go(page, "Calculadora");
  const main = page.getByRole("main");
  await main.getByLabel("Preço por kg").fill("100");
  await main.getByLabel("Gramas").fill("200"); // R$ 20 a mesa
  await main.getByLabel("Tempo de impressão").fill("2h");
  await main.getByLabel("Peças na mesa").fill("2");
  await main.getByLabel("Nome da peça").fill("Chaveiro coração");
  await main.getByRole("button", { name: "Adicionar ao orçamento" }).click();
  await main.getByLabel("Gramas").fill("100");
  await main.getByLabel("Nome da peça").fill("Topo de bolo");
  await main.getByRole("button", { name: "Adicionar ao orçamento" }).click();
  await main.getByRole("button", { name: /2 itens no orçamento em rascunho · Abrir/ }).click();

  const sheet = page.getByRole("dialog", { name: "Novo orçamento" });
  await expect(sheet.getByRole("textbox", { name: /Descrição/ }).first()).toHaveValue("Chaveiro coração");
  await sheet.getByLabel(/^Nome do cliente/).fill("Ana");
  await sheet.getByRole("button", { name: "Criar orçamento" }).click();
  await expect(page.getByRole("row", { name: /Ana/ })).toContainText("R$ 150,00"); // 2 × 50 + 2 × 25 (×5 sobre R$ 10 e R$ 5 por peça)
  await page.getByRole("button", { name: "Virar pedido" }).click();
  await expect(page.getByRole("button", { name: "virou o pedido #1" })).toBeVisible();
  const items = tauri.db.prepare("SELECT description, unitCost, printMinutes FROM order_items ORDER BY position").all();
  expect(items).toEqual([
    { description: "Chaveiro coração", unitCost: 10, printMinutes: 60 },
    { description: "Topo de bolo", unitCost: 5, printMinutes: 60 },
  ]);
});
