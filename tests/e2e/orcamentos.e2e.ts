import { expect, go, openApp, test, toastWith } from "./tauri";

async function seed(db: import("node:sqlite").DatabaseSync) {
  db.exec(`INSERT INTO company (id, data) VALUES (1, '{"name":"UpVision 3D","city":"Rio de Janeiro","pixKey":"52998224725","quoteValidityDays":7,"quoteTerms":"50% na aprovação."}');
    INSERT INTO customers (kind, name, discountPct, active) VALUES ('pj', 'Loja da Bia', 0, 1);
    INSERT INTO products (name, kind, composition, piecesPerPlate, manualPrice, consignmentPrice) VALUES ('Chaveiro', 'simple', '{"filaments":[],"materials":[],"items":[]}', 1, 15, 8);`);
}

test("orçamento: cria, salva PDF com Pix e vira pedido uma única vez", async ({ page, tauri }) => {
  await openApp(page);
  await seed(tauri.db);
  await go(page, "Orçamentos");
  await page.getByRole("button", { name: "Novo orçamento" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Novo orçamento" });
  await sheet.getByLabel("Nome do cliente").fill("Ana Souza");
  await sheet.getByRole("button", { name: "Adicionar item" }).click();
  await sheet.getByLabel("Produto").selectOption({ label: "Chaveiro" });
  await sheet.getByLabel("Qtd").fill("10");
  await expect(sheet.getByLabel("Condições comerciais")).toHaveValue("50% na aprovação.");
  await sheet.getByRole("button", { name: "Criar orçamento" }).click();
  await expect(toastWith(page, "Orçamento nº 1 criado.")).toBeVisible();

  const row = page.getByRole("row", { name: /Ana Souza/ });
  await expect(row).toContainText("R$ 150,00");
  await row.getByRole("button", { name: "PDF" }).click();
  await expect(toastWith(page, "Orçamento salvo em")).toBeVisible();
  const pdf = [...tauri.files.entries()].find(([p]) => p.endsWith(".pdf"));
  expect(pdf?.[0]).toMatch(/orcamento-1-ana-souza\.pdf$/);
  expect(pdf?.[1].subarray(0, 5).toString()).toBe("%PDF-");

  await row.getByRole("button", { name: "Virar pedido" }).click();
  await expect(toastWith(page, "virou o pedido #1")).toBeVisible();
  await expect(page.getByRole("row", { name: /Ana Souza/ })).toContainText("virou o pedido #1");
  await expect(page.getByRole("row", { name: /Ana Souza/ }).getByRole("button", { name: "Virar pedido" })).toHaveCount(0);
  const orders = tauri.db.prepare("SELECT customerName, quoteId FROM orders").all();
  expect(orders).toEqual([{ customerName: "Ana Souza", quoteId: 1 }]);
});

test("consignação e catálogo geram PDF", async ({ page, tauri }) => {
  await openApp(page);
  await seed(tauri.db);
  await go(page, "Orçamentos");
  await page.getByRole("button", { name: "Contrato de consignação" }).click();
  const c = page.getByRole("dialog", { name: "Contrato de consignação" });
  await c.getByLabel("Consignatário (loja parceira)").selectOption({ label: "Loja da Bia" });
  await c.getByLabel("Adicionar produto").selectOption({ label: "Chaveiro" });
  await expect(c.getByLabel("Repasse (R$)")).toHaveValue("8,00");
  await c.getByLabel("Qtd").fill("20");
  await expect(c.getByText("Total em repasse: R$ 160,00")).toBeVisible();
  await c.getByRole("button", { name: "Salvar PDF do contrato" }).click();
  await expect(toastWith(page, "Contrato salvo em")).toBeVisible();

  await page.getByRole("button", { name: "Catálogo PDF" }).click();
  await page.getByRole("dialog", { name: "Catálogo em PDF" }).getByRole("button", { name: "Salvar PDF (1)" }).click();
  await expect(toastWith(page, "Catálogo salvo em")).toBeVisible();
  const pdfs = [...tauri.files.keys()].filter((p) => p.endsWith(".pdf"));
  expect(pdfs.length).toBe(2);
});
