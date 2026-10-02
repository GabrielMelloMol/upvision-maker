import { resolve } from "node:path";
import { expect, go, openApp, test, toastWith } from "./tauri";

test("organizador pela foto: ferramentas de exemplo com medida, Gridfinity em 3D e salvar 3MF (#169)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Organizador pela foto");
  await expect(page.getByRole("img", { name: /Chave de fenda: 190 × 26 mm/ })).toBeVisible();
  await page.getByRole("button", { name: "Gridfinity" }).click();
  await expect(page.getByText(/Caixa Gridfinity de \d+×\d+ casas/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("organizador-gridfinity.3mf"))).toBe(true);
});

// foto realista (tests/fixtures/organizador/gerar.py --sombra 0.3): celular com zoom 2x a 56 cm, 9° inclinado, barril,
// sombra suave, ruído e JPEG. Medidas reais da base: chave de boca 155 × 34, argola 97,4 × 46, chave de fenda 182 × 28.
const REAL: [number, number][] = [
  [155, 34],
  [97.4, 46],
  [182, 28],
];

test("organizador pela foto: dicas de como fotografar, foto realista medida a menos de 2 mm e o contorno numerado em cima dela (#169)", async ({ page }) => {
  test.setTimeout(120_000); // decodificar e medir a foto leva alguns segundos
  await openApp(page);
  await go(page, "Organizador pela foto");
  const tips = page.getByRole("list", { name: "Como fotografar" });
  await expect(tips).toContainText("De longe, com zoom 2x");
  await expect(tips).toContainText("Boa luz, sem sombra");
  await page.locator(".photo-step input[type=file]").setInputFiles(resolve("tests/fixtures/organizador/ferramentas-a4-celular.jpg"));
  await expect(page.getByRole("button", { name: "Canto 1 da folha (setas movem)" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Trocar foto" })).toBeVisible();
  await page.getByLabel("Altura das ferramentas").fill("8");
  await page.getByLabel("Altura das ferramentas").blur();
  await expect(page.getByRole("img", { name: /Contornos medidos na folha de (210 × 297|297 × 210) mm/ })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".photo-found .tool-num")).toHaveCount(3);
  const items = await page.getByRole("list", { name: "Medidas" }).getByRole("listitem").allInnerTexts();
  const sizes = items.map((t) => [...t.matchAll(/(\d+,\d) × (\d+,\d)/g)][0].slice(1).map((n) => Number(n.replace(",", "."))));
  sizes.forEach(([l, w], i) => {
    expect(Math.abs(l - REAL[i][0]), `comprimento da ferramenta ${i + 1}`).toBeLessThan(2);
    expect(Math.abs(w - REAL[i][1]), `largura da ferramenta ${i + 1}`).toBeLessThan(2);
  });
});
