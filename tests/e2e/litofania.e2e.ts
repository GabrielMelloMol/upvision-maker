import { strFromU8, unzipSync } from "fflate";
import { expect, go, openApp, test, toastWith } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;
const objects3mf = (buf: Buffer) => (strFromU8(unzipSync(new Uint8Array(buf))["3D/3dmodel.model"]).match(/<object /g) ?? []).length;
/** Objetos na mesa do 3MF (uma peça com várias partes conta uma vez). */
const items3mf = (buf: Buffer) => (strFromU8(unzipSync(new Uint8Array(buf))["3D/3dmodel.model"]).match(/<item /g) ?? []).length;
const hud = (page: import("@playwright/test").Page) => page.locator(".viewer .hud");
/**
 * Espera a prévia terminar de gerar e devolve o texto das medidas. Relevo de foto é pesado: sob carga leva minutos.
 * Primeiro o 1º modelo (antes dele não há aria-busy durante o debounce); depois de uma mudança, o aria-busy já
 * vale na hora (o modelo na tela fica velho), então basta esperar ele sumir.
 */
async function settled(page: import("@playwright/test").Page): Promise<string> {
  await expect(hud(page)).toContainText("mm", { timeout: 150_000 });
  await expect(page.locator(".viewer")).not.toHaveAttribute("aria-busy", "true", { timeout: 150_000 });
  return hud(page).innerText();
}

// etapas pesadas (vários relevos de uma foto): 3× o tempo padrão, sem esperas fixas
test.slow();

test("litofania: plana, curva e caixa de luz a partir da foto; salva 3MF (#13)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Litofania e quadro");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/foto-pessoa.jpg");
  // abre na simulação contra a luz (original × litofania acesa); o 3D fica no outro botão
  await expect(page.getByRole("img", { name: "Simulação da litofania contra a luz" })).toBeVisible({ timeout: 150_000 });
  await expect(page.getByRole("img", { name: "Foto original" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/litofania-contra-a-luz.png` });
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "3D" }).click();
  const flat = await settled(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/litofania-plana.png` });

  await page.getByLabel("Formato").selectOption("curved");
  const curved = await settled(page);
  expect(curved).not.toBe(flat);
  await page.getByLabel("Formato").selectOption("box");
  expect(await settled(page)).not.toBe(curved);
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
  await settled(page);
  const swaps = page.getByRole("region", { name: "Trocas de filamento" }).or(page.locator('[aria-label="Trocas de filamento"]'));
  await expect(swaps).toContainText("Comece com");
  await expect(swaps.getByText(/Camada \d+ \(Z = /)).toHaveCount(2); // 3 cores = 2 trocas
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/quadro-camadas.png` });

  await page.getByRole("switch", { name: /Uma parte por cor/ }).check();
  // a prévia já mostra as 3 faixas; com AMS o arquivo perde as pausas (some o botão do Bambu) e ganha 3 partes
  await settled(page);
  await expect(page.locator(".viewer .legend span")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /Projeto do Bambu Studio/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect(objects3mf([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1])).toBeGreaterThanOrEqual(3);

  // shadowbox (#118): "Mesa por cor" também no quadro por camadas, um 3MF por cor para montar ou colar depois
  await page.getByRole("button", { name: "Mesa por cor" }).click();
  tauri.nextOpen = "/pasta";
  await page.getByRole("button", { name: /Salvar uma mesa por cor \(3 arquivos\)/ }).click();
  await expect(toastWith(page, "3 mesas salvas em /pasta")).toBeVisible();
  expect([...tauri.files.keys()].filter((k) => k.startsWith("/pasta/quadro-camadas-cor-")).sort()).toEqual(["/pasta/quadro-camadas-cor-1.3mf", "/pasta/quadro-camadas-cor-2.3mf", "/pasta/quadro-camadas-cor-3.3mf"]);
});

test("litofania: abajur cilíndrico, coração e círculo com a base de LED; um 3MF com a peça, a base e as tampas (#101)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Litofania e quadro");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/foto-pessoa.jpg");
  await expect(page.getByRole("img", { name: "Simulação da litofania contra a luz" })).toBeVisible({ timeout: 150_000 });
  await page.getByLabel("Formato").selectOption("cylinder");
  await expect(page.getByLabel(/^Largura/)).toHaveCount(0); // no cilindro vale o diâmetro e a altura
  await page.getByLabel(/^Diâmetro \(mm\)/).fill("70");
  await page.getByLabel(/^Altura \(mm\)/).fill("60");
  await page.getByRole("switch", { name: "Fazer a base de LED" }).check();
  await page.getByRole("switch", { name: "Tampa de cima" }).check();
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "3D" }).click();
  await settled(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const cyl = [...tauri.files].find(([p]) => p.endsWith("litofania.3mf"))!;
  expect(items3mf(cyl[1])).toBe(4); // tubo, base de LED, tampa da base e tampa do abajur

  for (const shape of ["heart", "circle"]) {
    await page.getByLabel("Formato").selectOption(shape);
    await settled(page);
  }
  await page.getByRole("button", { name: "Fita" }).click();
  await page.getByRole("button", { name: "Pilhas" }).click();
  await settled(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect.poll(() => [...tauri.files].filter(([p]) => p.endsWith("litofania.3mf")).length).toBeGreaterThan(0);
  const circle = [...tauri.files].find(([p]) => p.endsWith("litofania.3mf"))!;
  expect(items3mf(circle[1])).toBe(3); // círculo, base de LED e tampa da base
});

test("litofania colorida: 5 filamentos, aviso do AMS e do TD, prévia contra a luz e um volume por cor no 3MF (#102)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Litofania e quadro");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/foto-pessoa.jpg");
  await expect(page.getByRole("img", { name: "Simulação da litofania contra a luz" })).toBeVisible({ timeout: 150_000 });
  await page.getByRole("button", { name: "Litofania colorida" }).click();
  await expect(page.getByText(/5 filamentos ao mesmo tempo/)).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText(/Sem TD cadastrado para ciano, magenta, amarelo, preto/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Simulação da litofania contra a luz" })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/litofania-colorida-contra-a-luz.png` });
  for (const cor of ["ciano", "magenta", "amarelo", "preto"]) await page.getByLabel(new RegExp(`^TD ${cor}`)).fill("2.5");
  await expect(page.getByText(/Sem TD cadastrado/)).toHaveCount(0);
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "3D" }).click();
  await settled(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const file = [...tauri.files].find(([p]) => p.endsWith("litofania-colorida.3mf"))!;
  expect(items3mf(file[1])).toBe(1);
  const cfg = strFromU8(unzipSync(new Uint8Array(file[1]))["Metadata/model_settings.config"]);
  expect((cfg.match(/<part /g) ?? []).length).toBeGreaterThanOrEqual(4); // branco, tintas usadas
});
