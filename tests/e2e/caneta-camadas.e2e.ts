import { expect, go, openApp, test } from "./tauri";

// #320: camadas na mesa (texto, forma e peça 3D), arrastar, girar e simulação passo a passo. SHOTS=<pasta> guarda prints.
const SHOTS = process.env.SHOTS;

test("caneta: texto, estrela e peça 3D juntos; arrastar e girar na prévia; passo a passo", async ({ page }) => {
  await openApp(page);
  await go(page, "Desenhar com caneta");
  await page.getByRole("button", { name: "A4", exact: true }).click();
  await page.getByLabel("Folha deitada").check();
  await page.getByRole("group", { name: "Adicionar à mesa" }).getByRole("button", { name: "Texto" }).click();
  await page.getByRole("textbox", { name: "Texto" }).fill("Feliz aniversário!");
  await page.getByLabel(/^Y do meio/).fill("170");
  await page.getByRole("group", { name: "Adicionar à mesa" }).getByRole("button", { name: "Forma" }).click();
  await page.getByRole("combobox", { name: "Forma" }).selectOption("star");
  await page.getByLabel(/^Largura \(mm\)/).fill("50");
  await page.locator("input[type=file]").first().setInputFiles("tests/fixtures/3mf/chaveiro-2-partes-bambu.3mf");
  await expect(page.getByRole("list", { name: "Camadas" }).getByRole("button", { name: "chaveiro-2-partes-bambu", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(/^Largura \(mm\)/).fill("60");
  await page.getByLabel(/^Y do meio/).fill("60");
  const preview = page.getByRole("img", { name: "Prévia do desenho na mesa" });
  await expect(preview.locator("polyline").nth(5)).toBeAttached();

  // arrasta a estrela 40 mm para a direita (a caixa escolhida tem a bolinha de girar)
  const star = page.locator(".plot-preview rect[style*='move']").nth(1);
  const box = (await star.boundingBox())!;
  const mmPx = box.width / 50;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40 * mmPx, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel(/^X do meio/)).not.toHaveValue("128");
  const turn = page.locator(".plot-preview circle[style*='grab']");
  const t = (await turn.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + 60, t.y + 30, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel(/^Giro/)).not.toHaveValue("0");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/camadas.png`, fullPage: true });
  if (SHOTS) await page.locator(".preview-col").screenshot({ path: `${SHOTS}/camadas-previa.png` });

  await page.getByRole("button", { name: "Próximo traço" }).click();
  await page.getByRole("button", { name: "Próximo traço" }).click();
  await expect(page.getByText(/Traço 2 de \d+/)).toBeVisible();
  if (SHOTS) await page.locator(".preview-col").screenshot({ path: `${SHOTS}/passo-a-passo.png` });
  await page.getByText(/Ver o G-code/).click();
  await expect(page.getByLabel("G-code")).toHaveValue(/M400 U1/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/caneta-config.png`, fullPage: true });
});
