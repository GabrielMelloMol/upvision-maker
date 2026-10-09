import type { Locator } from "@playwright/test";
import { rowAction } from "./rowMenu";
import { expect, go, openApp, test, toastWith } from "./tauri";

async function register(form: Locator, opts: { failed?: string; layer?: string; notes?: string } = {}) {
  if (opts.failed) {
    await form.getByRole("button", { name: "Falhou" }).click();
    await form.getByLabel("Por que falhou?").fill(opts.failed);
  }
  if (opts.layer) await form.getByLabel("Camada (mm)").fill(opts.layer);
  if (opts.notes) await form.getByLabel("Anotações").fill(opts.notes);
  await form.getByRole("button", { name: "Registrar na ficha" }).click();
}

test("ficha de impressão: o que funcionou, histórico e taxa de falha medida no preço; registro pelo pedido (#163)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.exec(`INSERT INTO printers (name, watts) VALUES ('Bambu Lab A1', 95);
    INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 100, 1000, 1000, 0);
    INSERT INTO products (name, kind, composition, piecesPerPlate, stock, manualPrice) VALUES ('Vaso', 'simple', '{"filaments":[{"filamentId":1,"grams":50}],"materials":[],"items":[]}', 1, 0, 40);`);

  await go(page, "Produtos");
  await rowAction(page, "Vaso", "Editar");
  const sheet = page.getByRole("dialog", { name: /Vaso|Editar produto/ });
  const fichaSheet = sheet.getByRole("region", { name: "Ficha de impressão" });
  await expect(fichaSheet.getByText(/Anote como você imprimiu/)).toBeVisible();

  await fichaSheet.getByRole("button", { name: "Registrar impressão" }).click();
  await register(fichaSheet.getByRole("group", { name: "Registrar impressão" }), { layer: "0,2", notes: "PETG a 240 °C, com brim" });
  await expect(toastWith(page, "Impressão registrada na ficha.")).toBeVisible();
  await expect(fichaSheet.getByText(/O que funcionou/)).toBeVisible();
  await expect(fichaSheet.getByText("PETG a 240 °C, com brim")).toBeVisible();

  // fazer de novo: o formulário vem com o que funcionou
  await fichaSheet.getByRole("button", { name: "Registrar impressão" }).click();
  await expect(fichaSheet.getByLabel("Camada (mm)")).toHaveValue("0,2");
  await register(fichaSheet.getByRole("group", { name: "Registrar impressão" }), { failed: "soltou da mesa" });
  await fichaSheet.getByRole("button", { name: "Registrar impressão" }).click();
  await register(fichaSheet.getByRole("group", { name: "Registrar impressão" }));
  await expect(fichaSheet.getByText(/Deu certo 2 de 3 \(67%\)\. Taxa de falha medida: 33%, usada no preço/)).toBeVisible();
  await fichaSheet.getByText("Histórico (3)").click();
  await expect(fichaSheet.getByText(/Falhou: soltou da mesa/)).toBeVisible();
  await page.keyboard.press("Escape");

  // no pedido: a ficha aparece no item e dá para registrar a impressão dele
  tauri.db.exec(`INSERT INTO orders (customerName, channel, status, createdAt) VALUES ('Ana', 'Consumidor final', 'production', '2026-09-30 10:00:00');
    INSERT INTO order_items (orderId, position, productId, description, qty, unitPrice) VALUES (1, 0, 1, 'Vaso', 1, 40);`);
  await go(page, "Pedidos");
  await page.getByRole("button", { name: /Abrir pedido #1/ }).click();
  const detail = page.getByRole("dialog", { name: /Pedido #1/ });
  await expect(detail.getByText(/Ficha: .*0,2 mm/)).toBeVisible();
  await detail.getByRole("button", { name: "Registrar impressão" }).click();
  await register(detail.getByRole("group", { name: "Registrar impressão" }));
  await expect(toastWith(page, "Impressão registrada na ficha.").last()).toBeVisible();
  expect(tauri.db.prepare("SELECT COUNT(*) AS n FROM print_logs WHERE orderId = 1").get()).toEqual({ n: 1 });
});
