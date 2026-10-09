import { SEED_ORDERS } from "../visual/seed";
import { expect, go, openApp, test } from "./tauri";

// SHOTS=antes|depois|windows  →  docs/screenshots/<SHOTS>/<página>-<largura>-<esquema>[@escala].png
const DIR = `docs/screenshots/${process.env.SHOTS ?? "antes"}`;
// No Windows: notebook 1366×768 a 100% e Full HD a 125% e 150% (viewport em pixels CSS = físico ÷ escala).
const SIZES =
  process.env.SHOTS === "windows"
    ? [
        { width: 1366, height: 768, scale: 1 },
        { width: 1536, height: 864, scale: 1.25 },
        { width: 1280, height: 720, scale: 1.5 },
      ]
    : [
        { width: 1280, height: 800, scale: 1 },
        { width: 1440, height: 900, scale: 1 },
      ];
const suffix = (scale: number) => (scale === 1 ? "" : `@${scale * 100}`);
const PAGES = [
  ["inicio", "Início"],
  ["svg", "Imagem → SVG"],
  ["cortador", "Cortador de biscoito"],
  ["chaveiros", "Chaveiros"],
  ["medalhas", "Medalhas"],
  ["extrusao", "Desenho em 3D"],
  ["qr", "QR Code e Pix"],
  ["modelos", "Modelos prontos"],
  ["ia", "Pedir à IA"],
  ["painel", "Painel"],
  ["pedidos", "Pedidos"],
  ["orcamentos", "Orçamentos"],
  ["financeiro", "Financeiro"],
  ["custos", "Custos operacionais"],
  ["calculadora", "Calculadora"],
  ["clientes", "Clientes"],
  ["produtos", "Produtos"],
  ["filamentos", "Filamentos"],
  ["materiais", "Materiais extras"],
  ["impressoras", "Impressoras"],
  ["empresa", "Dados da empresa"],
  ["preferencias", "Preferências"],
] as const;

test.skip(!process.env.SHOTS, "só roda com SHOTS=antes|depois");

for (const size of SIZES) {
  test.describe(`escala ${size.scale * 100}%`, () => {
    test.use({ deviceScaleFactor: size.scale });
    for (const scheme of ["light", "dark"] as const) {
      test(`telas ${size.width}x${size.height}${suffix(size.scale)} ${scheme}`, async ({
        page,
        tauri,
      }) => {
        test.setTimeout(180_000);
        await page.emulateMedia({
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        await page.setViewportSize(size);
        await openApp(page, { keepOnboarding: true });
        const welcome = page.getByRole("dialog", {
          name: "Boas-vindas ao UpVision Maker",
        });
        if (process.env.SHOTS !== "antes") {
          await page.waitForTimeout(400);
          await page.screenshot({
            path: `${DIR}/onboarding-${size.width}-${scheme}${suffix(size.scale)}.png`,
          });
        }
        await welcome.getByRole("button", { name: "Agora não" }).click();
        // dados de exemplo para as tabelas não ficarem vazias
        await go(page, "Impressoras"); // cria o banco (migrações rodam no 1º acesso)
        await expect(page.getByText("Nada cadastrado ainda.")).toBeVisible();
        await page.waitForTimeout(400);
        await page.screenshot({
          path: `${DIR}/vazio-impressoras-${size.width}-${scheme}${suffix(size.scale)}.png`,
        });
        tauri.db.exec(
          `INSERT INTO printers (name, watts) VALUES ('Bambu Lab A1', 95), ('Ender 3 V3', 150)`,
        );
        tauri.db.exec(
          `INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA','Preto','Voolt',99.9,1000,850,200), ('PETG','Branco','3D Fila',119,1000,120,200)`,
        );
        tauri.db.exec(
          `INSERT INTO materials (name, unit, unitPrice, stock, min) VALUES ('Argola de chaveiro','un',0.35,120,20), ('Saquinho kraft','un',0.9,8,10)`,
        );
        if (process.env.SHOTS !== "antes") tauri.db.exec(SEED_ORDERS);
        for (const [slug, label] of PAGES) {
          await go(page, label);
          await expect(page.locator("main h1").first()).toBeVisible();
          if (slug === "cortador" || slug === "extrusao") {
            await page
              .locator('input[type="file"]')
              .setInputFiles("tests/fixtures/desenho.jpg");
            await expect(page.locator(".viewer .hud")).toContainText("mm", {
              timeout: 60_000,
            });
          }
          if (slug === "svg") {
            await page
              .locator('input[type="file"]')
              .setInputFiles("tests/fixtures/logo.jpg");
            await page.getByRole("button", { name: /^Aplicar/ }).click();
            await expect(page.getByText("Resultado atualizado.")).toBeVisible({
              timeout: 60_000,
            });
          }
          if (slug === "chaveiros" || slug === "medalhas" || slug === "modelos")
            await page.waitForTimeout(2500);
          await page.waitForTimeout(400);
          await page.screenshot({
            path: `${DIR}/${slug}-${size.width}-${scheme}${suffix(size.scale)}.png`,
          });
        }
      });
    }
  });
}
