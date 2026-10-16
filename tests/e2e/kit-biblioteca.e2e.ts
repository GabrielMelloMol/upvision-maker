import type { Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { expect, openApp, pickModel, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
const objectNames = (buf: Buffer) => [...strFromU8(unzipSync(new Uint8Array(buf))["3D/3dmodel.model"]).matchAll(/<object id="\d+" name="([^"]*)" type="model"><components>/g)].map((m) => m[1]);

for (const [search, label, steps, scaleField] of [
  ["Foguete", "Foguete", /Para montar: .*Encaixe o bocal do foguete/, /^Altura do foguete/],
  ["Trator", "Trator", /Para montar: .*Prenda as rodas/, /^Comprimento do trator/],
] as const) {
  test(`biblioteca de kit cards: ${search} abre, mostra o passo a passo e salva o cartão no 3MF`, async ({ page, tauri }) => {
    test.slow();
    await openApp(page);
    await pickModel(page, search, label, { exact: true });
    await idle(page);
    await expect(page.getByText(steps)).toBeVisible({ timeout: 90_000 });
    await page.getByLabel(/^Nome do kit/).fill(search);
    await expect(page.getByLabel(scaleField)).toBeVisible();
    await idle(page);
    await page.getByRole("button", { name: /Salvar 3MF/ }).click();
    await expect(toastWith(page, "Arquivo salvo em")).toBeVisible({ timeout: 90_000 });
    const names = objectNames([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1]);
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names.join(" ")).toContain(label);
  });
}
