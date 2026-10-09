import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const FIX = "tests/fixtures";

async function traceImage(page: Page, file: string) {
  await go(page, "Imagem em desenho (SVG)");
  await page.locator('input[type="file"]').setInputFiles(`${FIX}/${file}`);
  await expect(page.getByRole("img", { name: "Imagem original" })).toBeVisible();
}

async function applyAndWait(page: Page) {
  await page.getByRole("button", { name: /^Aplicar/ }).click();
  await expect(page.getByText("Resultado atualizado.")).toBeVisible({ timeout: 60_000 });
  const paths = Number(await page.locator(".metrics span", { hasText: "Caminhos" }).locator("b").innerText());
  return paths;
}

for (const file of ["logo.jpg", "desenho.jpg"]) {
  test(`Imagem→SVG: ${file} vetoriza e salva SVG em mm`, async ({ page, tauri }) => {
    await openApp(page);
    await traceImage(page, file);
    const paths = await applyAndWait(page);
    expect(paths).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Salvar SVG" }).click();
    await expect(toastWith(page, "SVG salvo em")).toBeVisible();
    const svg = [...tauri.files].find(([p]) => p.endsWith(".svg"))![1].toString();
    expect(svg).toMatch(/<svg[^>]*width="[\d.]+mm"/);
  });
}

test("Imagem→SVG: foto de pessoa sugere Silhueta e recorta o contorno", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await traceImage(page, "foto-pessoa.jpg");
  await expect(page.getByText("Isso parece uma foto.")).toBeVisible();
  await page.getByRole("button", { name: "Usar modo Silhueta" }).click();
  await expect(page.getByRole("button", { name: "Silhueta", pressed: true })).toBeVisible();
  const paths = await applyAndWait(page);
  // silhueta = poucos contornos cheios
  expect(paths).toBeGreaterThan(0);
  expect(paths).toBeLessThan(20);
});

test("Imagem→SVG → Cortador: handoff do SVG e export STL/3MF", async ({ page, tauri }) => {
  await openApp(page);
  await traceImage(page, "desenho.jpg");
  await applyAndWait(page);
  await page.getByRole("button", { name: "Fazer cortador" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Cortador de biscoito" })).toBeVisible();
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const threemf = [...tauri.files].find(([p]) => p.endsWith(".3mf"))![1];
  expect(threemf.subarray(0, 2).toString()).toBe("PK"); // zip

  const stlButtons = page.getByRole("button", { name: /STL/ });
  await stlButtons.first().click();
  await expect.poll(() => [...tauri.files.keys()].filter((p) => p.endsWith(".stl")).length).toBeGreaterThan(0);
  const stl = [...tauri.files].find(([p]) => p.endsWith(".stl"))![1];
  const tris = stl.readUInt32LE(80);
  expect(tris).toBeGreaterThan(100);
  expect(stl.length).toBe(84 + tris * 50);
});

test("Cortador: SVG direto, sem carimbo, e cancelar o diálogo não grava nada", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Cortador de biscoito");
  const star = `<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="60mm" viewBox="0 0 100 100"><path d="M50 5 L61 38 L95 38 L67 58 L78 92 L50 72 L22 92 L33 58 L5 38 L39 38 Z"/></svg>`;
  await page.locator('input[type="file"]').setInputFiles({ name: "estrela.svg", mimeType: "image/svg+xml", buffer: Buffer.from(star) });
  await expect(page.getByLabel(/Largura/)).toHaveValue("60");
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
  tauri.savePath = () => null;
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await page.waitForTimeout(300);
  expect([...tauri.files.keys()].filter((p) => p.endsWith(".3mf"))).toHaveLength(0);
});
