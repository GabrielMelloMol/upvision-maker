import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, go, openApp, prefsSection, test, toastWith } from "./tauri";

// #246: comissão por categoria, aviso de regras novas para canal editado e recálculo das taxas dos pedidos antigos.
// SHOTS_DIR=pasta grava os prints.
const SHOTS = process.env.SHOTS_DIR;
async function shot(page: Page, name: string, scrollTo?: Locator) {
  if (!SHOTS) return;
  await scrollTo?.scrollIntoViewIfNeeded();
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
const EDITED = JSON.stringify({ failurePct: 0, channels: [{ name: "Shopee", feePct: 20, feeFixed: 4, extraPerSale: 1.5, checkedAt: "2026-05-01" }, { name: "Mercado Livre (clássico)", feePct: 14, feeFixed: 5.65, checkedAt: "2026-10-15", categories: [{ name: "Categoria com 10%", feePct: 10 }, { name: "Categoria com 14%", feePct: 14 }], category: "Categoria com 14%" }] });
const seedSettings = (db: import("node:sqlite").DatabaseSync, json: string) => db.exec(`INSERT INTO settings (id, data) VALUES (1, '${json}') ON CONFLICT(id) DO UPDATE SET data = excluded.data`);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
});

test("canal editado mostra as regras novas de 2026 com antes e depois; atualizar mantém o custo extra", async ({ page, tauri }) => {
  await openApp(page);
  seedSettings(tauri.db, EDITED);
  await go(page, "Preferências");
  await prefsSection(page, "Canais de venda");
  const news = page.getByRole("group", { name: "Regras novas para Shopee" });
  await expect(news).toContainText("Há regras novas de 2026 para este canal (de 15/10/2026): atualizar?");
  await expect(news).toContainText("Antes (as suas): 20% + R$ 4,00");
  await expect(news).toContainText("Depois (regras de 2026): 20% + R$ 4,50");
  await expect(page.getByRole("group", { name: "Regras novas para Mercado Livre (clássico)" })).toHaveCount(0); // já conferido depois das regras
  await shot(page, "01-aviso-regras-novas", news);
  await news.getByRole("button", { name: "Atualizar Shopee" }).click();
  await expect(news).toHaveCount(0);
  await expect(page.getByLabel("A partir de (faixa 1, Shopee)")).toHaveValue("80,00");
  await expect(page.getByLabel("Custo extra por venda").first()).toHaveValue("1,50"); // o que era só dela fica
});

test("Manter as minhas some com o aviso e marca o canal como conferido", async ({ page, tauri }) => {
  await openApp(page);
  seedSettings(tauri.db, EDITED);
  await go(page, "Preferências");
  await prefsSection(page, "Canais de venda");
  await page.getByRole("group", { name: "Regras novas para Shopee" }).getByRole("button", { name: "Manter as minhas" }).click();
  await expect(page.getByRole("group", { name: "Regras novas para Shopee" })).toHaveCount(0);
  await expect(page.getByText("Conferido em 15/10/2026.").first()).toBeVisible();
});

test("categoria do anúncio: escolher outra categoria muda a taxa e o preço do canal na Calculadora", async ({ page, tauri }) => {
  await openApp(page);
  seedSettings(tauri.db, EDITED);
  await page.evaluate(() => localStorage.setItem("upvision:calculadora", JSON.stringify({ mode: "full", fil: [{ ref: "", price: "", qty: "" }], ext: [], printerId: "", f: {} })));
  const priceOf = async () => {
    await go(page, "Calculadora");
    await page.getByLabel("Preço por kg").fill("1000");
    await page.getByLabel("Gramas").fill("40");
    await page.getByLabel("Tempo de impressão").fill("0");
    const row = page.getByRole("table").filter({ hasText: "Taxas e impostos" }).getByRole("row", { name: /^Mercado Livre \(clássico\)/ });
    await expect(row).toBeVisible();
    return (await row.textContent())!.replace(/\u00a0/g, " ");
  };
  const before = await priceOf();
  await go(page, "Preferências");
  await prefsSection(page, "Canais de venda");
  const select = page.getByLabel("Categoria do anúncio (Mercado Livre (clássico))");
  await expect(select).toHaveValue("Categoria com 14%");
  await select.selectOption("Categoria com 10%");
  await shot(page, "02-categoria-do-anuncio", select);
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(toastWith(page, "Preferências salvas")).toBeVisible();
  const after = await priceOf();
  expect(after).not.toBe(before);
  const value = (t: string) => Number((t.match(/R\$ ([\d.]+,\d{2})/) ?? [])[1]?.replace(".", "").replace(",", "."));
  expect(value(after)).toBeLessThan(value(before)); // comissão de 10% pede preço menor que a de 14%
});

for (const scheme of ["light", "dark"] as const)
  test(`Financeiro: recalcular as taxas dos pedidos antigos (${scheme})`, async ({ page, tauri }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await openApp(page);
    seedSettings(tauri.db, JSON.stringify({ failurePct: 0, taxPct: 0, channels: [{ name: "Shopee", feePct: 20, feeFixed: 4.5, checkedAt: "2026-10-15" }] }));
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    tauri.db.exec(`INSERT INTO orders (customerName, channel, status, deliveredAt, createdAt, fees) VALUES ('Ana', 'Shopee', 'delivered', '${day}', '${day} 09:00:00', 0), ('Bia', 'Shopee', 'delivered', '${day}', '${day} 09:00:00', 3);
      INSERT INTO order_items (orderId, position, description, qty, unitPrice, discountPct, unitCost, printMinutes) VALUES (1, 0, 'Chaveiro', 10, 15, 0, 4, 12), (2, 0, 'Chaveiro', 1, 15, 0, 4, 12);`);
    await go(page, "Financeiro");
    const box = page.getByRole("region", { name: "Pedidos antigos sem taxa do canal" });
    await expect(box).toContainText("1 pedido entregue está sem a taxa do canal");
    await box.getByRole("button", { name: "Recalcular taxas dos pedidos antigos" }).click();
    // 10 un. de R$ 15: 20% (3,00) + R$ 4,50 = 7,50 por unidade = R$ 75,00
    await expect(box).toContainText("Shopee: R$ 75,00 em 1 pedido");
    await shot(page, `03-recalcular-taxas-${scheme}`, box);
    const axe = await new AxeBuilder({ page }).include(".fee-recalc").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    await box.getByRole("button", { name: "Recalcular 1 pedido" }).click();
    await expect(toastWith(page, "Taxas recalculadas em 1 pedido")).toBeVisible();
    await expect(box).toHaveCount(0);
    const rows = tauri.db.prepare("SELECT id, fees FROM orders ORDER BY id").all() as { id: number; fees: number }[];
    expect(rows).toEqual([{ id: 1, fees: 75 }, { id: 2, fees: 3 }]); // o pedido que já tinha taxa não muda
    const hist = tauri.db.prepare("SELECT note FROM order_history WHERE orderId = 1").all() as { note: string }[];
    expect(hist.some((h) => h.note.includes("Taxas do canal recalculadas"))).toBe(true);
  });
