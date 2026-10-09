import { expect, go, openApp, test, toastWith } from "./tauri";

test("amostra e erro de impressão: baixa o filamento, entra no Financeiro como perda e excluir devolve (#189)", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA', 'Azul', 'X', 100, 1000, 1000, 0);
    INSERT INTO products (name, kind, composition, piecesPerPlate, stock, manualPrice) VALUES ('Chaveiro', 'simple', '{"filaments":[{"filamentId":1,"grams":12}],"materials":[],"items":[]}', 1, 0, 15);`);
  const stockG = () => (tauri.db.prepare("SELECT stockG FROM filaments").get() as { stockG: number }).stockG;
  await go(page, "Filamentos");
  await page.getByRole("button", { name: "Amostra ou erro de impressão" }).click();
  const sheet = page.getByRole("dialog", { name: "Amostra ou erro de impressão" });
  await sheet.getByLabel("Produto (opcional)").selectOption({ label: "Chaveiro" });
  await sheet.getByLabel("Gramas").fill("50");
  await sheet.getByRole("button", { name: "Registrar e dar baixa" }).click();
  await expect(toastWith(page, "Erro de impressão registrado")).toBeVisible();
  expect(stockG()).toBe(950);
  expect(tauri.db.prepare("SELECT kind, cost FROM waste_runs").get()).toEqual({ kind: "failure", cost: 5 });
  page.once("dialog", (d) => d.accept());
  await sheet.getByRole("button", { name: /Excluir registro de/ }).click();
  await expect.poll(stockG).toBe(1000);
});
