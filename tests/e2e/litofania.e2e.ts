import { strFromU8, unzipSync } from "fflate";
import { expect, go, openApp, test, toastWith } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;
const objects3mf = (buf: Buffer) => (strFromU8(unzipSync(new Uint8Array(buf))["3D/3dmodel.model"]).match(/<object /g) ?? []).length;
const hud = (page: import("@playwright/test").Page) => page.locator(".viewer .hud");

test("litofania: plana, curva e caixa de luz a partir da foto; salva 3MF (#13)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Litofania e quadro");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/foto-pessoa.jpg");
  // abre na simulação contra a luz (original × litofania acesa); o 3D fica no outro botão
  await expect(page.getByRole("img", { name: "Simulação da litofania contra a luz" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("img", { name: "Foto original" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/litofania-contra-a-luz.png` });
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "3D" }).click();
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  const flat = await hud(page).innerText();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/litofania-plana.png` });

  await page.getByRole("button", { name: "Curva", exact: true }).click();
  await expect(hud(page)).not.toHaveText(flat, { timeout: 60_000 });
  await page.getByRole("button", { name: "Caixa de luz", exact: true }).click();
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/litofania-caixa.png` });

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect(objects3mf([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1])).toBeGreaterThanOrEqual(1);
});

test("quadro por camadas: filamentos cadastrados viram trocas por camada; AMS separa uma parte por cor (#13)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.exec(`INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA','Preto','X',99,1000,800,0), ('PLA','Cinza','X',99,1000,800,0), ('PLA','Branco','X',99,1000,800,0)`);
  await go(page, "Litofania e quadro");
  await page.getByRole("button", { name: "Quadro por camadas", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/foto-pessoa.jpg");
  for (const c of ["Preto", "Cinza", "Branco"]) await page.locator("label.check", { hasText: c }).getByRole("checkbox").check();
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  const swaps = page.getByRole("region", { name: "Trocas de filamento" }).or(page.locator('[aria-label="Trocas de filamento"]'));
  await expect(swaps).toContainText("Comece com");
  await expect(swaps.getByText(/Camada \d+ \(Z = /)).toHaveCount(2); // 3 cores = 2 trocas
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/quadro-camadas.png` });

  await page.getByRole("switch", { name: /Uma parte por cor/ }).check();
  // a prévia já mostra as 3 faixas; com AMS o arquivo perde as pausas (some o botão do Bambu) e ganha 3 partes
  await expect(page.locator(".viewer .legend span")).toHaveCount(3, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Projeto do Bambu Studio/ })).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect(objects3mf([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1])).toBeGreaterThanOrEqual(3);
});
