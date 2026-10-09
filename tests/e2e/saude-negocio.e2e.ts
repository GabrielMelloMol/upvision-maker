import { expect, go, openApp, test } from "./tauri";

test("painel: semáforo de saúde do negócio com o que fazer e atalho para resolver (#190)", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 100, 1000, 0, 200);
    INSERT INTO orders (customerName, channel, status, dueDate, createdAt) VALUES ('Bia', 'Consumidor final', 'pending', '2020-01-01', '2020-01-01 10:00:00');
    INSERT INTO order_items (orderId, position, description, qty, unitPrice) VALUES (1, 0, 'Peça', 1, 10);`);
  await go(page, "Painel");
  const card = page.getByRole("region", { name: "Saúde do negócio" });
  await expect(card).toContainText("Precisa de ação agora");
  await expect(card).toContainText("1 item zerado");
  await expect(card).toContainText("1 pedido atrasado");
  await expect(card).toContainText("O que fazer:");
  await card.getByRole("button", { name: "Resolver: Estoque" }).click();
  await expect(page.getByRole("heading", { name: "Filamentos", level: 1 })).toBeVisible();
});
