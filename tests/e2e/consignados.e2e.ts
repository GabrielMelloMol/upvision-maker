import { expect, go, openApp, test, toastWith } from "./tauri";

test("consignados: aviso de prazo e reposição que vira pedido de revenda com termo em PDF (#184)", async ({ page, tauri }) => {
  await openApp(page);
  const start = new Date(Date.now() - 25 * 86_400_000).toISOString().slice(0, 10); // reposição em 5 dias
  tauri.db.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 100, 1000, 1000, 0);
    INSERT INTO products (name, kind, composition, piecesPerPlate, stock, manualPrice, consignmentPrice) VALUES ('Chaveiro', 'simple', '{"filaments":[{"filamentId":1,"grams":10}],"materials":[],"items":[]}', 1, 0, 15, 8);
    INSERT INTO customers (kind, name, discountPct, active) VALUES ('pj', 'Loja da Bia', 0, 1);
    INSERT INTO consignments (customerId, customerName, startDate, periodDays, items, active, createdAt) VALUES (1, 'Loja da Bia', '${start}', 30, '[{"productId":1,"name":"Chaveiro","qty":20,"transferPrice":8,"salePrice":15}]', 1, '2026-09-01');`);
  await go(page, "Orçamentos");
  await expect(page.getByText(/Consignados: Loja da Bia \(faltam \d dias para a reposição\)/)).toBeVisible();
  await page.getByRole("button", { name: "Ver consignados" }).click();
  await page.getByRole("button", { name: "Registrar reposição de Loja da Bia" }).click();
  await page.getByRole("dialog", { name: /Reposição · Loja da Bia/ }).getByRole("button", { name: "Registrar reposição" }).click();
  await expect(toastWith(page, "Reposição registrada: pedido #1.")).toBeVisible();
  await expect(toastWith(page, "Termo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".pdf"))).toBe(true);
  expect(tauri.db.prepare("SELECT channel, status FROM orders").get()).toEqual({ channel: "Revenda", status: "production" });
});
