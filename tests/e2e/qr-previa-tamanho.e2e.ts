import { expect, go, openApp, test } from "./tauri";

for (const [w, h] of [[1024, 768], [1280, 800]])
  test(`#80: prévia do QR Code ocupa a coluna em ${w} px, mesmo depois de abrir Dados da empresa (QR Pix pequeno)`, async ({ page, tauri }) => {
    await page.setViewportSize({ width: w, height: h });
    await openApp(page);
    await go(page, "Impressoras"); // cria o banco
    tauri.db.prepare("INSERT INTO company (id, data) VALUES (1, ?)").run(JSON.stringify({ name: "Ateliê da Ana", pixKey: "fulano@exemplo.com", pixName: "Ana Souza", pixCity: "Niterói" }));
    await go(page, "Dados da empresa");
    const thumb = page.getByRole("img", { name: "Prévia do QR Pix" });
    await expect(thumb).toBeVisible();
    expect((await thumb.boundingBox())!.width).toBeLessThanOrEqual(150); // o da Empresa continua miniatura

    await go(page, "QR Code e Pix");
    const preview = page.getByRole("img", { name: "Prévia do QR Code" });
    await expect(preview.locator("img")).toBeVisible();
    const box = (await preview.boundingBox())!;
    expect(box.width).toBeGreaterThan(300); // era 140 px com a colisão de classe
    expect(box.height).toBeGreaterThan(300);
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/qr-previa-${w}.png` });
  });
