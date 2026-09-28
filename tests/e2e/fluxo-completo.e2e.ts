import { resolve } from "node:path";
import { expect, go, openApp, test, toastWith } from "./tauri";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");

/**
 * O caminho inteiro de uma venda, como ela faria no dia a dia:
 * arquivo do fatiador → produto → orçamento (PDF com Pix) → pedido → baixa de estoque → entrega → Financeiro.
 */
test("fluxo completo: fatiador → produto → orçamento → pedido → estoque → financeiro", async ({ page, tauri }) => {
  test.setTimeout(120_000);
  await openApp(page);
  tauri.db.exec(`INSERT INTO printers (name, watts) VALUES ('A1', 110);
    INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'Bambu', 120, 1000, 800, 200), ('PLA', 'Branco', 'Bambu', 110, 1000, 900, 200);
    INSERT INTO company (id, data) VALUES (1, '{"name":"Ateliê da Ana","city":"Niterói","pixKey":"52998224725","pixName":"Ana Souza","pixCity":"Niteroi","quoteValidityDays":7,"quoteTerms":"50% na aprovação."}');`);
  const stock = () => tauri.db.prepare("SELECT color, stockG FROM filaments ORDER BY id").all() as { color: string; stockG: number }[];
  const before = stock();

  // 1. Calculadora: importa o 3MF fatiado e salva como produto
  await go(page, "Calculadora");
  await page.locator(".card", { hasText: "Importar do fatiador" }).locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/slicer", "bambu-a1-2cores-fatiado.3mf"));
  await expect(page.getByLabel("Gramas").nth(1)).toHaveValue("0,55");
  await expect(page.getByLabel("Preço por kg").nth(0)).toHaveValue("120,00");
  await page.getByRole("button", { name: "Salvar como produto" }).click();
  const productSheet = page.getByRole("dialog", { name: "Novo produto" });
  await productSheet.getByLabel("Nome").fill("Chaveiro 2 cores");
  await productSheet.getByRole("button", { name: "Salvar produto" }).click();
  await expect(page.getByRole("row", { name: /Chaveiro 2 cores/ })).toBeVisible();
  const product = tauri.db.prepare("SELECT id, printerId, piecesPerPlate FROM products").get() as { id: number; printerId: number; piecesPerPlate: number };
  expect(product).toMatchObject({ printerId: 1, piecesPerPlate: 3 });

  // 2. Orçamento com o produto, PDF com Pix, vira pedido
  await go(page, "Orçamentos");
  await page.getByRole("button", { name: "Novo orçamento" }).first().click();
  const quoteSheet = page.getByRole("dialog", { name: "Novo orçamento" });
  await quoteSheet.getByLabel("Nome do cliente").fill("Ana Souza");
  await quoteSheet.getByRole("button", { name: "Adicionar item" }).click();
  await quoteSheet.getByLabel("Produto").selectOption({ label: "Chaveiro 2 cores" });
  await quoteSheet.getByLabel("Qtd").fill("6");
  await quoteSheet.getByRole("button", { name: "Criar orçamento" }).click();
  await expect(toastWith(page, "Orçamento nº 1 criado.")).toBeVisible();
  const quoteRow = page.getByRole("row", { name: /Ana Souza/ });
  await quoteRow.getByRole("button", { name: "PDF" }).click();
  await expect(toastWith(page, "Orçamento salvo em")).toBeVisible();
  const pdf = [...tauri.files].find(([p]) => p.endsWith(".pdf"))![1];
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  await quoteRow.getByRole("button", { name: "Virar pedido" }).click();
  await expect(toastWith(page, "virou o pedido #1")).toBeVisible();

  // 3. Pedido: iniciar produção baixa o filamento (6 peças = 2 mesas de 3)
  await go(page, "Pedidos");
  await page.getByRole("region", { name: "Pendente" }).getByRole("button", { name: "Iniciar produção →" }).click();
  await expect(page.getByRole("region", { name: "Em produção" }).getByRole("button", { name: /Abrir pedido #1/ })).toBeVisible();
  await expect.poll(() => stock().map((f) => f.stockG)).not.toEqual(before.map((f) => f.stockG));
  const after = stock();
  after.forEach((f, i) => expect(f.stockG).toBeLessThan(before[i].stockG));
  expect(before[0].stockG - after[0].stockG).toBeCloseTo(2 * 3.79, 1); // azul: 3,79 g por mesa
  expect(before[1].stockG - after[1].stockG).toBeCloseTo(2 * 0.55, 1); // branco: 0,55 g por mesa

  // 4. Concluir e entregar
  await page.getByRole("region", { name: "Em produção" }).getByRole("button", { name: "Concluir →" }).click();
  await page.getByRole("region", { name: "Concluído" }).getByRole("button", { name: "Marcar entregue →" }).click();
  await expect(page.getByRole("region", { name: "Entregue" }).getByRole("button", { name: /Abrir pedido #1/ })).toBeVisible();
  const { total } = tauri.db.prepare("SELECT SUM(qty * unitPrice * (1 - discountPct / 100.0)) AS total FROM order_items WHERE orderId = 1").get() as { total: number };
  expect(total).toBeGreaterThan(0);

  // 5. Financeiro: a receita do período é o valor do pedido entregue
  await go(page, "Financeiro");
  const tile = page.locator(".stat", { hasText: "Receita" }).first();
  await expect(tile).toContainText(money(Math.round(total * 100) / 100));
  await expect(page.locator(".stat", { hasText: "Custo das peças" }).first()).not.toContainText("R$ 0,00");
});
