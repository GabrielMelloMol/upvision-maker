import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

/** STL binário de um bloco 40 × 30 × 20 (12 triângulos). */
function boxStl(): Buffer {
  const w = 40, d = 30, h = 20;
  const v = (x: number, y: number, z: number) => [x * w, y * d, z * h];
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

test("decal no seu modelo: abre o STL, clica numa face na prévia, põe um desenho embutido e salva o 3MF (#113)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Decal no seu modelo");
  await expect(page.getByText(/Use só modelos que são seus ou cuja licença permite/)).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "caixa.stl", mimeType: "model/stl", buffer: boxStl() });
  await expect(page.getByRole("group", { name: "Faces planas" }).getByRole("button")).toHaveCount(6);
  await idle(page);
  await expect(page.locator(".viewer .hud")).toContainText("40.0 × 30.0 × 20.0 mm");

  // clique no meio da prévia: o raio acerta a caixa e a face atingida fica escolhida
  await page.locator(".viewer").click();
  await expect(page.getByRole("group", { name: "Faces planas" }).getByRole("button", { pressed: true })).toHaveCount(1);
  await expect(page.locator(".legend")).toContainText("Face escolhida");

  await page.getByLabel("Arquivo do desenho").setInputFiles({ name: "quadrado.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SQUARE) });
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Desenho 1");
  await expect(page.locator(".legend")).not.toContainText("Face escolhida");
  await expect(page.locator(".decal-gizmo")).toBeVisible();
  // a peça continua do mesmo tamanho: a cor entra rente, não cresce
  await expect(page.locator(".viewer .hud")).toContainText("40.0 × 30.0 × 20.0 mm");

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("caixa-decal.3mf"))).toBe(true);
});
