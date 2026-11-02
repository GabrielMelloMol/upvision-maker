import { expect, go, openApp, test } from "./tauri";

// #324: texto em caixa (tamanho da letra em mm, quebra de linha, alinhamento, letras de traço) e clique duplo para editar.
const SHOTS = process.env.SHOTS;

test("caneta: texto longo quebra na caixa sem diminuir a letra; alça do lado muda a caixa; clique duplo edita", async ({ page }) => {
  await openApp(page);
  await go(page, "Desenhar com caneta");
  await page.getByRole("group", { name: "Nova camada" }).getByRole("button", { name: "Texto" }).click();
  await page.getByRole("combobox", { name: "Letra" }).selectOption("s:futural");
  await page.getByRole("textbox", { name: "Texto" }).fill("Feliz aniversário, Maria! Que o seu dia seja lindo");
  await page.getByLabel(/^Tamanho da letra/).fill("8");
  await page.getByRole("button", { name: "Centro" }).click();
  if (SHOTS) await page.locator(".card", { has: page.getByRole("textbox", { name: "Texto" }) }).screenshot({ path: `${SHOTS}/editor.png` });
  await page.getByRole("button", { name: "Adicionar à mesa" }).click();
  const preview = page.getByRole("img", { name: "Prévia do desenho na mesa" });
  await expect(preview.locator("polyline").nth(20)).toBeAttached({ timeout: 15_000 });
  const tall = async () => (await page.locator(".plot-preview rect[style*='move']").first().boundingBox())!.height;
  const before = await tall();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/texto-caixa.png`, fullPage: true });

  // alça do lado: caixa mais estreita = mais linhas, a letra continua do mesmo tamanho
  const handle = page.locator(".plot-preview rect[style*='ew-resize']");
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x - 120, h.y + h.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(tall).toBeGreaterThan(before * 1.3);
  await expect(page.getByLabel(/^Tamanho da letra/)).toHaveValue("8");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/texto-estreito.png` });

  // clique duplo na prévia leva à edição
  await page.locator(".plot-preview rect[style*='move']").first().dblclick();
  await expect(page.getByRole("textbox", { name: "Texto" })).toBeFocused();
});
