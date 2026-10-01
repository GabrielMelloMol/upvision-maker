import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

/** Fotos reais (#162): foto da peça impressa no projeto vira a miniatura em Meus projetos; ajuste com canvas de verdade. */
test("foto da peça no projeto: adiciona, ajusta (girar e recorte quadrado) e vira a miniatura", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Chaveiros");
  await idle(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  await expect.poll(() => (tauri.db.prepare("SELECT COUNT(*) AS n FROM tool_projects").get() as { n: number }).n).toBe(1);

  await go(page, "Meus projetos");
  const grid = page.getByRole("list", { name: "Projetos" });
  await grid.getByRole("button", { name: /^Ações de chaveiro/ }).click();
  await page.getByRole("menuitem", { name: "Renomear e tags…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Escolher fotos").setInputFiles("tests/fixtures/logo.jpg");
  const photos = dialog.getByRole("list", { name: "Fotos da peça impressa" });
  await expect(photos.getByRole("img", { name: "Capa" })).toBeVisible();

  const original = (tauri.db.prepare("SELECT dataUrl FROM photos").get() as { dataUrl: string }).dataUrl;
  await photos.getByRole("button", { name: "Ações da foto 1" }).click();
  await page.getByRole("menuitem", { name: /^Ajustar/ }).click();
  const editor = page.getByRole("dialog", { name: "Ajustar foto" });
  await editor.getByRole("button", { name: "Girar para a direita" }).click();
  await editor.getByRole("button", { name: "Quadrado" }).click();
  await editor.getByRole("button", { name: "Salvar foto" }).click();
  await expect.poll(() => (tauri.db.prepare("SELECT dataUrl FROM photos WHERE owner LIKE 'project:%'").get() as { dataUrl: string }).dataUrl).not.toBe(original);
  // foto quadrada: a imagem gravada tem largura = altura
  const size = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }, (tauri.db.prepare("SELECT dataUrl FROM photos").get() as { dataUrl: string }).dataUrl);
  expect(size[0]).toBe(size[1]);

  await page.getByRole("dialog", { name: "Editar projeto" }).getByRole("button", { name: "Cancelar" }).click();
  const photo = (tauri.db.prepare("SELECT dataUrl FROM photos").get() as { dataUrl: string }).dataUrl;
  await expect.poll(async () => grid.locator("img").first().getAttribute("src")).toBe(photo);
});
