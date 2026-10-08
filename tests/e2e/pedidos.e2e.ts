import { expect, go, openApp, test, toastWith } from "./tauri";

async function seed(tauri: { db: import("node:sqlite").DatabaseSync }) {
  tauri.db.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 100, 1000, 1000, 0);
    INSERT INTO products (name, kind, composition, piecesPerPlate, stock, manualPrice) VALUES ('Chaveiro', 'simple', '{"filaments":[{"filamentId":1,"grams":10}],"materials":[],"items":[]}', 1, 1, 15);
    INSERT INTO customers (kind, name, discountPct, active) VALUES ('pf', 'Ana', 10, 1);`);
}
const filamentStock = (t: { db: import("node:sqlite").DatabaseSync }) => (t.db.prepare("SELECT stockG FROM filaments").get() as { stockG: number }).stockG;
const productStock = (t: { db: import("node:sqlite").DatabaseSync }) => (t.db.prepare("SELECT stock FROM products").get() as { stock: number }).stock;

test("pedidos: cria com preço do produto e desconto do cliente; iniciar produção baixa o estoque e cancelar devolve", async ({ page, tauri }) => {
  await openApp(page);
  await seed(tauri);
  await go(page, "Pedidos");
  await page.getByRole("button", { name: "Novo pedido" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Novo pedido" });
  await sheet.getByLabel("Cliente cadastrado").selectOption({ label: "Ana" });
  await sheet.getByLabel("Prazo de entrega").fill("2026-10-10");
  await sheet.getByRole("button", { name: "Adicionar item" }).click();
  await sheet.getByLabel("Produto").selectOption({ label: "Chaveiro" });
  await expect(sheet.getByLabel("Preço un.")).toHaveValue("15,00");
  await expect(sheet.getByLabel("Desc. %")).toHaveValue("10");
  await sheet.getByLabel("Qtd").fill("3");
  await expect(sheet.getByText("R$ 40,50").first()).toBeVisible(); // 3 × 15 − 10%
  await sheet.getByRole("button", { name: "Criar pedido" }).click();
  await expect(toastWith(page, "Pedido #1 criado.")).toBeVisible();

  const pending = page.getByRole("region", { name: "Pendente" });
  await expect(pending.getByRole("button", { name: /Abrir pedido #1 de Ana/ })).toBeVisible();
  await pending.getByRole("button", { name: "Iniciar produção →" }).click();
  await expect(page.getByRole("region", { name: "Em produção" }).getByRole("button", { name: /Abrir pedido #1/ })).toBeVisible();
  expect(productStock(tauri)).toBe(0); // 1 pronto usado
  expect(filamentStock(tauri)).toBe(980); // 2 fabricados × 10 g

  await page.getByRole("button", { name: /Abrir pedido #1/ }).click();
  const detail = page.getByRole("dialog", { name: /Pedido #1/ });
  await expect(detail.getByText("Em produção · Estoque baixado")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await detail.getByRole("group", { name: "Mudar status" }).getByRole("button", { name: "Cancelado" }).click();
  await expect(toastWith(page, "Pedido #1: Cancelado.")).toBeVisible();
  expect(productStock(tauri)).toBe(1);
  expect(filamentStock(tauri)).toBe(1000);
});

test("pedidos: lista mostra atrasados e filtra por status", async ({ page, tauri }) => {
  await openApp(page);
  await seed(tauri);
  tauri.db.exec(`INSERT INTO orders (customerName, channel, status, dueDate, createdAt) VALUES ('Bia', 'Consumidor final', 'pending', '2020-01-01', '2020-01-01 10:00:00'), ('Caio', 'Revenda', 'delivered', '2020-01-01', '2020-01-01 10:00:00');
    INSERT INTO order_items (orderId, position, description, qty, unitPrice) VALUES (1, 0, 'Peça', 1, 10), (2, 0, 'Peça', 2, 10);`);
  await go(page, "Pedidos");
  await page.getByRole("group", { name: "Visualização" }).getByRole("button", { name: "Lista" }).click();
  await expect(page.getByRole("row", { name: /Bia/ })).toContainText("atrasado");
  await expect(page.getByRole("row", { name: /Caio/ })).not.toContainText("atrasado");
  await page.getByLabel("Status").selectOption({ label: "Entregue" });
  await expect(page.getByRole("row", { name: /Bia/ })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Caio/ })).toContainText("R$ 20,00");
});

test("pedidos: sinal, marcar como pago e o 'A receber' no Painel (#177)", async ({ page, tauri }) => {
  await openApp(page);
  await seed(tauri);
  tauri.db.exec(`INSERT INTO orders (customerName, channel, status, createdAt) VALUES ('Bia', 'Consumidor final', 'done', '2026-10-01 10:00:00');
    INSERT INTO order_items (orderId, position, description, qty, unitPrice) VALUES (1, 0, 'Peça', 2, 50);`);
  await go(page, "Pedidos");
  await page.getByRole("button", { name: /Abrir pedido #1 de Bia/ }).click();
  const box = page.getByRole("dialog", { name: /Pedido #1/ }).getByRole("region", { name: "Pagamento" });
  await expect(box).toContainText("A receber");
  await box.getByLabel(/Valor recebido até agora/).fill("30");
  await box.getByRole("button", { name: "Salvar valor recebido" }).click();
  await expect(page.getByRole("button", { name: /Abrir pedido #1 de Bia/ })).toContainText("Sinal recebido · falta R$ 70,00");
  await go(page, "Painel");
  await expect(page.locator(".stat", { hasText: "A receber" })).toContainText("R$ 70,00");
  await go(page, "Pedidos");
  await page.getByRole("button", { name: /Abrir pedido #1 de Bia/ }).click();
  await page.getByRole("dialog", { name: /Pedido #1/ }).getByRole("button", { name: "Marcar como pago" }).click();
  await expect(toastWith(page, "Pedido #1: pago.")).toBeVisible();
});

test("pedidos: confirmação do pedido em PDF (#185)", async ({ page, tauri }) => {
  await openApp(page);
  await seed(tauri);
  tauri.db.exec(`INSERT INTO orders (customerName, channel, status, paymentMethod, dueDate, paidAmount, createdAt) VALUES ('Bia', 'Consumidor final', 'pending', 'Pix', '2026-10-30', 20, '2026-10-01 10:00:00');
    INSERT INTO order_items (orderId, position, description, qty, unitPrice) VALUES (1, 0, 'Peça', 2, 50);`);
  await go(page, "Pedidos");
  await page.getByRole("button", { name: /Abrir pedido #1 de Bia/ }).click();
  await page.getByRole("dialog", { name: /Pedido #1/ }).getByRole("button", { name: "Confirmação em PDF" }).click();
  await expect(toastWith(page, "Confirmação salva em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".pdf"))).toBe(true);
});
