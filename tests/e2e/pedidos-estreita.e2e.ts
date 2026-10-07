import { expect, go, openApp, test } from "./tauri";
import { SEED_BASE, SEED_ORDERS } from "../visual/seed";

// Auditoria de UX (A3): em janela estreita com a barra lateral aberta, a coluna "Entregue" ficava cortada, com o
// nome e o valor pela metade e sem nenhum sinal de que havia mais à direita.
for (const [largura, barra] of [[1000, "aberta"], [1100, "aberta"], [900, "recolhida"]] as const)
  test(`quadro de pedidos em ${largura} px com a barra ${barra}: as 4 colunas ficam inteiras na tela (A3)`, async ({ page, tauri }) => {
    await page.setViewportSize({ width: largura, height: 700 });
    await openApp(page);
    tauri.db.exec(SEED_BASE + SEED_ORDERS);
    if (barra === "aberta" && largura < 1100) await page.getByRole("button", { name: "Expandir barra lateral" }).click();
    await go(page, "Pedidos");
    const board = page.getByLabel("Quadro de pedidos");
    await expect(board).toBeVisible();
    const main = (await page.locator("main").boundingBox())!;
    for (const nome of ["Pendente", "Em produção", "Concluído", "Entregue"]) {
      const col = (await page.getByRole("region", { name: nome }).boundingBox())!;
      expect(col.x, `${nome} começa dentro da tela`).toBeGreaterThanOrEqual(main.x - 1);
      expect(col.x + col.width, `${nome} termina dentro da tela`).toBeLessThanOrEqual(main.x + main.width + 1);
    }
    expect(await board.evaluate((el) => el.scrollWidth - el.clientWidth), "sem rolagem horizontal escondida").toBeLessThanOrEqual(1);
  });
