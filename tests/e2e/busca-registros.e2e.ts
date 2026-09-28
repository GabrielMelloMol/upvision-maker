import { expect, openApp, test } from "./tauri";

test("busca global abre cliente e pedido direto na edição/detalhe", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO customers (kind, name, phone, active) VALUES ('pf', 'Beatriz Lima', '21 99999-0000', 1);
    INSERT INTO orders (customerName, channel, status, dueDate, createdAt) VALUES ('Beatriz Lima', 'Consumidor final', 'pending', '2026-10-10', '2026-09-28 10:00:00');
    INSERT INTO order_items (orderId, position, description, qty, unitPrice) VALUES (1, 0, 'Topo de bolo', 1, 30);`);
  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("beatriz");
  await page.getByRole("option", { name: /Beatriz Lima/ }).filter({ hasText: "21 99999" }).click();
  await expect(page.getByRole("dialog", { name: "Editar Beatriz Lima" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("topo de bolo");
  await page.getByRole("option", { name: /Pedido #1/ }).click();
  await expect(page.getByRole("dialog", { name: /Pedido #1 · Beatriz Lima/ })).toBeVisible();
});
