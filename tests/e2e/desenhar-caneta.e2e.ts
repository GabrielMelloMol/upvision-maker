import { expect, go, openApp, test, toastWith } from "./tauri";

// #303: imagem vira traços de caneta e G-code. SHOTS=<pasta> guarda prints da tela.
const SHOTS = process.env.SHOTS;

test("desenhar com caneta: imagem vira traços na mesa e o G-code sai como teste no ar", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Desenhar com caneta");
  await expect(page.getByRole("heading", { name: "Desenhar com caneta" })).toBeVisible();
  await page.locator("input[type=file]").first().setInputFiles("tests/fixtures/logo.jpg");
  await expect(page.locator(".plot-preview polyline").first()).toBeAttached({ timeout: 30_000 });
  await expect(page.getByText(/Traços/)).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/imagem.png`, fullPage: true });
  await page.getByRole("button", { name: /Salvar G-code/ }).click();
  await expect(toastWith(page, "G-code salvo em /saida/logo-teste-no-ar.gcode")).toBeVisible();
  const g = tauri.files.get("/saida/logo-teste-no-ar.gcode")!.toString();
  expect(g).toContain("TESTE NO AR");
  expect(g).not.toMatch(/\bE\d/);

  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.getByLabel("Texto").fill("Obrigada, Val");
  await expect(page.locator(".plot-preview polyline").nth(5)).toBeAttached();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/texto.png`, fullPage: true });
});
