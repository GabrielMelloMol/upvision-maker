import { expect, go, openApp, test, toastWith } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;

test("etiquetas de rolo: PDF e plaquinhas 3D; ler o código dá baixa e 'Rolo acabou' (#12)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA','Azul','Voolt',99.9,1000,800,200), ('PETG','Preto','3D Fila',119,1000,350,200)`);
  await go(page, "Etiquetas de rolo");
  await page.getByRole("button", { name: "Marcar todos" }).click();
  await expect(page.getByText("2 escolhidos")).toBeVisible();
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/etiquetas-light.png` });

  await page.getByRole("button", { name: "Salvar etiquetas (PDF)" }).click();
  await expect(toastWith(page, "Etiquetas salvas em")).toBeVisible();
  const pdf = [...tauri.files].find(([p]) => p.endsWith(".pdf"))![1];
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();

  // leitor USB = digita o código e Enter
  const code = page.getByLabel("Código da etiqueta");
  await code.fill("upvision:filamento/1");
  await code.press("Enter");
  const lido = page.getByRole("group", { name: "Rolo lido" }).or(page.locator('[aria-label="Rolo lido"]'));
  await expect(lido).toContainText("#1");
  await lido.getByLabel(/Usei/).fill("40");
  await lido.getByRole("button", { name: "Dar baixa" }).click();
  await expect(toastWith(page, "Baixa de")).toBeVisible();
  await expect.poll(() => (tauri.db.prepare("SELECT stockG FROM filaments WHERE id = 1").get() as { stockG: number }).stockG).toBe(760);

  await code.fill("upvision:filamento/2");
  await code.press("Enter");
  await lido.getByRole("button", { name: "Rolo acabou" }).click();
  await expect(toastWith(page, "marcado como acabado")).toBeVisible();
  const petg = tauri.db.prepare("SELECT stockG FROM filaments WHERE id = 2").get() as { stockG: number };
  expect(petg.stockG).toBeLessThan(350);

  await code.fill("https://exemplo.com");
  await code.press("Enter");
  await expect(page.getByText("Esse QR não é uma etiqueta de rolo do UpVision Maker.")).toBeVisible();
});
