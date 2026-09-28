import { expect, go, openApp, test } from "./tauri";

// SHOTS=antes|depois  →  docs/screenshots/<SHOTS>/<página>-<largura>.png
const DIR = `docs/screenshots/${process.env.SHOTS ?? "antes"}`;
const SIZES = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];
const PAGES = [
  ["inicio", "Início"],
  ["svg", "Imagem → SVG"],
  ["cortador", "Cortador de biscoito"],
  ["chaveiros", "Chaveiros"],
  ["medalhas", "Medalhas"],
  ["extrusao", "Extrusão 3D"],
  ["ia", "Pedir à IA"],
  ["calculadora", "Calculadora"],
  ["filamentos", "Filamentos"],
  ["materiais", "Materiais extras"],
  ["impressoras", "Impressoras"],
  ["preferencias", "Preferências"],
] as const;

test.skip(!process.env.SHOTS, "só roda com SHOTS=antes|depois");

for (const scheme of ["light", "dark"] as const) {
  for (const size of SIZES) {
    test(`telas ${size.width}x${size.height} ${scheme}`, async ({ page, tauri }) => {
      test.setTimeout(180_000);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.setViewportSize(size);
      await openApp(page, { keepOnboarding: true });
      const welcome = page.getByRole("dialog", { name: "Boas-vindas ao UpVision Maker" });
      if (process.env.SHOTS !== "antes") {
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${DIR}/onboarding-${size.width}-${scheme}.png` });
      }
      await welcome.getByRole("button", { name: "Agora não" }).click();
      // dados de exemplo para as tabelas não ficarem vazias
      await go(page, "Impressoras"); // cria o banco (migrações rodam no 1º acesso)
      await expect(page.getByText("Nada cadastrado ainda.")).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/vazio-impressoras-${size.width}-${scheme}.png` });
      tauri.db.exec(`INSERT INTO printers (name, watts) VALUES ('Bambu Lab A1', 95), ('Ender 3 V3', 150)`);
      tauri.db.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA','Preto','Voolt',99.9,1000,850,200), ('PETG','Branco','3D Fila',119,1000,120,200)`);
      tauri.db.exec(`INSERT INTO materials (name, unit, unitPrice, stock, min) VALUES ('Argola de chaveiro','un',0.35,120,20), ('Saquinho kraft','un',0.9,8,10)`);
      for (const [slug, label] of PAGES) {
        await go(page, label);
        await expect(page.locator("main h1").first()).toBeVisible();
        if (slug === "cortador" || slug === "extrusao") {
          await page.locator('input[type="file"]').setInputFiles("tests/fixtures/desenho.jpg");
          await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
        }
        if (slug === "svg") {
          await page.locator('input[type="file"]').setInputFiles("tests/fixtures/logo.jpg");
          await page.getByRole("button", { name: /^Aplicar/ }).click();
          await expect(page.getByText("Resultado atualizado.")).toBeVisible({ timeout: 60_000 });
        }
        if (slug === "chaveiros" || slug === "medalhas") await page.waitForTimeout(2500);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${DIR}/${slug}-${size.width}-${scheme}.png` });
      }
    });
  }
}
