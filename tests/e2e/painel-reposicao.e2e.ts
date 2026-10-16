import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { expect, go, openApp, test } from "./tauri";

const PRINTS = process.env.PAINEL_PRINTS;
const today = new Date();
const iso = (daysAgo: number) => new Date(today.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);

/** Dois produtos em duas impressoras e dois canais, com vendas nos últimos 30 dias e um pedido aberto. */
function seed(db: { exec: (sql: string) => void }) {
  const comp = JSON.stringify({ filaments: [], materials: [], items: [] }).replace(/'/g, "''");
  db.exec(`INSERT INTO printers (id, name, watts) VALUES (1, 'Bambu A1', 100), (2, 'Ender 3', 150);
    INSERT INTO products (id, name, composition, stock, piecesPerPlate, printerId) VALUES (1, 'Chaveiro de nome', '${comp}', 4, 12, 1), (2, 'Vaso espiral', '${comp}', 1, 1, 2), (3, 'Porta-copo', '${comp}', 40, 6, 1);
    INSERT INTO orders (id, customerName, channel, status, deliveredAt, createdAt) VALUES (1, 'Ana', 'Shopee', 'delivered', '${iso(8)}', '2026-01-01 10:00:00'), (2, 'Bia', 'Instagram', 'delivered', '${iso(5)}', '2026-01-01 10:00:00'), (3, 'Caio', 'Instagram', 'pending', NULL, '2026-01-01 10:00:00');
    INSERT INTO order_items (orderId, position, productId, description, qty, unitPrice, unitCost, printMinutes) VALUES
      (1, 0, 1, 'Chaveiro de nome', 36, 12, 4, 6), (1, 1, 3, 'Porta-copo', 12, 15, 5, 8),
      (2, 0, 2, 'Vaso espiral', 6, 60, 18, 120), (3, 0, 2, 'Vaso espiral', 3, 60, 18, 120);`);
}

test("painel: reposição sugerida (imprima mais N, em mesas) e onde dá mais lucro por canal e impressora (#215)", async ({ page, tauri }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await openApp(page);
  seed(tauri.db);
  await go(page, "Painel");
  const restock = page.getByRole("region", { name: "Reposição sugerida" });
  await expect(restock.getByText(/Imprima mais/).first()).toBeVisible();
  await expect(restock).toContainText("Vaso espiral");
  await expect(restock).toContainText("faltam 2 peças dos pedidos");
  await expect(restock).toContainText("mesas");
  await restock.getByRole("button", { name: "30 dias" }).click();
  await restock.getByRole("button", { name: "7 dias" }).click();
  const profit = page.getByRole("region", { name: "Onde dá mais lucro" });
  await expect(profit.getByRole("list", { name: "Lucro por canal" })).toContainText("melhor");
  await expect(profit.getByRole("list", { name: "Lucro por impressora" })).toContainText("R$");
  if (PRINTS) {
    mkdirSync(PRINTS, { recursive: true });
    await restock.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${PRINTS}/01-painel-reposicao-e-lucro.png`, fullPage: true });
  }
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const r = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});

test("financeiro: por canal e por impressora mostram margem e R$ por hora (#215)", async ({ page, tauri }) => {
  await openApp(page);
  seed(tauri.db);
  await go(page, "Financeiro");
  await expect(page.locator(".card", { hasText: "Por canal" })).toContainText(/margem \d+%/);
  await expect(page.locator(".card", { hasText: "Por impressora" })).toContainText(/R\$\s[\d.,]+\/h/);
});
