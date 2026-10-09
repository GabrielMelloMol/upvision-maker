import { resolve } from "node:path";
import { expect, go, openApp, test } from "./tauri";

test("buscar modelos: abre a busca de cada site, filtro de grátis, recentes, licença e arquivo fatiado para a calculadora (#77)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Buscar modelos na internet");
  await page.getByLabel("O que você procura").fill("vaso espiral");
  await page.getByRole("switch", { name: /Só modelos grátis/ }).check();
  await page.getByRole("button", { name: "Buscar no Cults3D" }).click();
  await expect.poll(() => tauri.opened).toContain("https://cults3d.com/pt/busca?q=vaso%20espiral&only_free=true");
  await page.getByRole("button", { name: /Buscar em todos/ }).click();
  await expect.poll(() => tauri.opened.length).toBe(6);
  expect(tauri.opened).toContain("https://makerworld.com/en/search/models?keyword=vaso%20espiral");
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/buscar-modelos.png` });

  // licença NC: não pode vender
  await page.getByLabel("Licença do modelo").selectOption({ label: "CC BY-NC (e NC-SA, NC-ND)" });
  await expect(page.getByText(/NC = não comercial: não pode vender/)).toBeVisible();

  // link do MakerWorld: dica do Bambu Studio e abrir; link de outro site não abre
  await page.getByLabel("Link do modelo").fill("https://evil.example.com/x");
  await expect(page.getByText("Cole o link de um dos sites da lista.")).toBeVisible();
  await page.getByLabel("Link do modelo").fill("https://makerworld.com/en/models/123");
  await expect(page.getByText(/Abrir no Bambu Studio/)).toBeVisible();
  await page.getByRole("button", { name: "Abrir no MakerWorld" }).click();
  await expect.poll(() => tauri.opened.at(-1)).toBe("https://makerworld.com/en/models/123");

  // a busca fica nas recentes depois de reabrir
  await page.reload();
  await go(page, "Buscar modelos na internet");
  await page.getByRole("group", { name: "Buscas recentes" }).getByRole("button", { name: "vaso espiral" }).click();
  await expect(page.getByLabel("O que você procura")).toHaveValue("vaso espiral");

  // STL avisa para fatiar; 3MF fatiado vai para a calculadora já preenchido
  await page.locator('input[type="file"]').setInputFiles({ name: "peca.stl", mimeType: "model/stl", buffer: Buffer.from("solid x") });
  await expect(page.getByText(/fatie no Bambu Studio/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(resolve("tests/fixtures/slicer/bambu-a1-2cores-fatiado.3mf"));
  await expect(page.getByRole("heading", { name: "Calculadora de preço", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Completo" }).click();
  await expect(page.getByText("Lido de")).toBeVisible();
  await expect(page.getByLabel("Gramas").first()).toHaveValue("3,79");
});
