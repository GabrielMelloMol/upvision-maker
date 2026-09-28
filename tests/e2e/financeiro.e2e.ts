import { expect, go, openApp, test, toastWith } from "./tauri";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = iso(new Date());
const monthStart = today.slice(0, 8) + "01";

function seed(db: import("node:sqlite").DatabaseSync) {
  db.exec(`INSERT INTO printers (name, watts) VALUES ('A1', 110);
    INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Preto', 'X', 100, 1000, 50, 200);
    INSERT INTO products (name, kind, composition, piecesPerPlate, printerId, stock) VALUES ('Chaveiro', 'simple', '{"filaments":[],"materials":[],"items":[]}', 1, 1, 0);
    INSERT INTO orders (customerName, channel, status, deliveredAt, createdAt) VALUES ('Ana', 'Shopee', 'delivered', '${monthStart}', '${monthStart} 09:00:00');
    INSERT INTO order_items (orderId, position, productId, description, qty, unitPrice, discountPct, unitCost, printMinutes) VALUES (1, 0, 1, 'Chaveiro', 10, 15, 0, 4, 12);
    INSERT INTO orders (customerName, channel, status, dueDate, createdAt) VALUES ('Bia', 'Consumidor final', 'production', '2020-01-01', '2020-01-01 09:00:00');
    INSERT INTO order_items (orderId, position, description, qty, unitPrice) VALUES (2, 0, 'Topo de bolo', 1, 50);
    INSERT INTO operational_costs (description, category, amount, frequency, startDate, notes) VALUES ('Aluguel', 'Aluguel', 60, 'monthly', '${monthStart}', '');`);
}

test("financeiro: receita pela entrega, lucro com custos, R$/hora, filtro por canal e planilha", async ({ page, tauri }) => {
  await openApp(page);
  seed(tauri.db);
  await go(page, "Financeiro");
  await page.getByRole("group", { name: "Período" }).getByRole("button", { name: "Este mês" }).click();
  const tile = (label: string) => page.locator(".stat", { has: page.locator(".stat-label").getByText(label, { exact: true }) });
  await expect(tile("Receita")).toContainText("R$ 150,00");
  await expect(tile("Custo das peças")).toContainText("R$ 40,00");
  await expect(tile("Custos operacionais")).toContainText("R$ 60,00");
  await expect(tile("Lucro")).toContainText("R$ 50,00");
  await expect(tile("R$ por hora de impressão")).toContainText("R$ 75,00"); // 150 / 2 h
  await expect(page.locator(".hbars li", { hasText: "A1" })).toBeVisible(); // por impressora
  await page.getByLabel("Canal").selectOption({ label: "Consumidor final" });
  await expect(tile("Receita")).toContainText("R$ 0,00");
  await page.getByLabel("Canal").selectOption({ label: "Todos" });
  await page.getByRole("button", { name: "Exportar planilha" }).click();
  await expect(toastWith(page, "Planilha salva em")).toBeVisible();
  const csv = [...tauri.files.entries()].find(([p]) => p.endsWith(".csv"))![1].toString("utf8");
  expect(csv).toContain("Ana;Shopee;Chaveiro;10;15;0;150;4;110");
  expect(csv).toContain("Lucro;50");
});

test("painel: atrasados, estoque acabando e abrir pedido", async ({ page, tauri }) => {
  await openApp(page);
  seed(tauri.db);
  await go(page, "Painel");
  await expect(page.locator(".stat", { hasText: "Atrasados" })).toContainText("1");
  await expect(page.locator(".card", { hasText: "Estoque acabando" })).toContainText("PLA · Preto · X");
  await expect(page.locator(".card", { hasText: "Mais vendidos" })).toContainText("Chaveiro");
  await page.getByRole("button", { name: "#2 Bia" }).click();
  await expect(page.getByRole("dialog", { name: /Pedido #2 · Bia/ })).toBeVisible();
});

test("custos operacionais: cadastra parcela com data final", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Custos operacionais");
  await page.getByRole("button", { name: "Novo custo" }).first().click();
  const s = page.getByRole("dialog", { name: "Novo custo" });
  await s.getByLabel("Descrição").fill("Parcela da impressora");
  await s.getByLabel("Valor (R$)").fill("250");
  await s.getByLabel("Termina em (opcional)").fill("2027-06-30");
  await s.getByRole("button", { name: "Salvar custo" }).click();
  await expect(page.getByRole("row", { name: /Parcela da impressora/ })).toContainText("até 30/06/2027");
  expect((tauri.db.prepare("SELECT amount, endDate FROM operational_costs").get() as { amount: number }).amount).toBe(250);
});
