import type { Page } from "@playwright/test";
import { expect as baseExpect, go, openApp, test, toastWith } from "./tauri";

// o cálculo roda em worker com WASM próprio e leva alguns segundos
const expect = baseExpect.configure({ timeout: 60_000 });
const idle = async (page: Page) => {
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0);
  await expect(page.locator(".viewer .busy-chip")).toHaveCount(0);
};

/** STL binário de um bloco 50 × 50 × 50 (12 triângulos). */
function boxStl(): Buffer {
  const n = 50;
  const v = (x: number, y: number, z: number) => [x * n, y * n, z * n];
  const quads = [
    [v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)],
    [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
    [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)],
    [v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)],
    [v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)],
    [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)],
  ];
  const buf = Buffer.alloc(84 + quads.length * 100);
  buf.writeUInt32LE(quads.length * 2, 80);
  let o = 84;
  for (const [a, b, c, e] of quads)
    for (const tri of [[a, b, c], [a, c, e]]) {
      o += 12;
      for (const p of tri) for (const x of p) { buf.writeFloatLE(x, o); o += 4; }
      o += 2;
    }
  return buf;
}

test("miolo leve: peça com giroide, corte ao meio, comparação das 3 estruturas e 3MF; depois o bloco de treliça (#236)", async ({ page, tauri }) => {
  test.setTimeout(240_000);
  await openApp(page);
  await go(page, "Deixar a peça mais leve");
  await expect(page.getByText("Envie um STL ou 3MF para alivianar.")).toBeVisible();
  await expect(page.getByText(/Use só modelos que são seus ou cuja licença permite/)).toBeVisible();

  await page.locator('input[type="file"]').first().setInputFiles({ name: "cubo.stl", mimeType: "model/stl", buffer: boxStl() });
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("50.0 × 50.0 × 50.0");
  await expect(page.getByText(/g em PLA, contra 155,0 g maciça: economia de/)).toBeVisible();

  await page.getByLabel("Ver por dentro (corte ao meio, só na prévia)").check();
  await expect(page.locator(".viewer .hud")).toContainText("50.0 × 25.0 × 50.0");

  await page.getByRole("button", { name: /Comparar giroide, voronoi e treliça/ }).click();
  const list = page.getByRole("list", { name: "Comparação das estruturas" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.getByText("mais leve")).toBeVisible();
  await list.getByRole("listitem").filter({ hasText: "Voronoi" }).getByRole("button", { name: "Usar voronoi" }).click();
  await idle(page);
  await expect(page.getByRole("button", { name: "Voronoi", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(list.getByRole("button", { name: "Em uso" })).toBeVisible();

  tauri.files.clear();
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);

  await page.getByRole("button", { name: "Bloco de treliça" }).click();
  await page.getByLabel("Ver por dentro (corte ao meio, só na prévia)").uncheck();
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("60.0 × 40.0 × 30.0");
  await expect(page.getByText(/g em PLA, contra/)).toBeVisible();
});
