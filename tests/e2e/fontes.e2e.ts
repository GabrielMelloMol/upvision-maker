import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { expect, go, openApp, test, toastWith } from "./tauri";

const FONT_FILE = readFileSync(new URL("../../src/assets/fonts/rubik-mono-one-400.ttf", import.meta.url));
const SHOTS = process.env.SHOTS_DIR;
const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

async function openPicker(page: Page) {
  await page.getByRole("button", { name: /^Fonte: .*Trocar fonte$/ }).click();
  return page.getByRole("dialog", { name: "Escolher fonte" });
}

test("chaveiro: seletor visual com prévia do nome, categorias, busca, favoritas e avisos de impressão (#20)", async ({ page }) => {
  await openApp(page);
  await go(page, "Chaveiros");
  await expect(page.getByRole("button", { name: "Fonte: Pacifico. Trocar fonte" })).toContainText("Ana");
  await page.getByLabel("Texto", { exact: true }).fill("Júlia");

  const sheet = await openPicker(page);
  const cards = sheet.getByRole("list", { name: "Fontes" }).getByRole("listitem");
  expect(await cards.count()).toBeGreaterThanOrEqual(50);
  await expect(cards.first()).toContainText("Júlia");
  // a prévia desenha com a própria fonte (carregada sob demanda, sem internet)
  await expect.poll(() => page.evaluate(() => document.fonts.check('20px "uvf-pacifico"'))).toBe(true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/fontes-seletor.png` });

  await sheet.getByRole("button", { name: "Cursiva", exact: true }).click();
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(12);
  await expect(cards.filter({ hasNotText: "· Cursiva" })).toHaveCount(0);

  await sheet.getByRole("searchbox", { name: "Buscar fonte" }).fill("bebas");
  await expect(cards).toHaveCount(1);
  await sheet.getByRole("button", { name: "Favoritar Bebas Neue" }).click();
  await sheet.getByRole("searchbox", { name: "Buscar fonte" }).fill("");
  await sheet.getByRole("button", { name: "Favoritas", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Bebas Neue");

  // cursiva fina em letra pequena: avisa traço < 0,4 mm
  await sheet.getByRole("searchbox", { name: "Buscar fonte" }).fill("great");
  await sheet.getByRole("button", { name: "Great Vibes (Cursiva)" }).click();
  await expect(sheet).toBeHidden();
  await page.getByLabel(/^Altura do texto/).fill("8");
  await expect(page.getByText(/menos de 0,4 mm/)).toBeVisible({ timeout: 60_000 });

  // cursiva de letras separadas: avisa que o nome não sai emendado
  await page.getByLabel(/^Altura do texto/).fill("16");
  await page.getByLabel("Texto", { exact: true }).fill("Ana Júlia");
  await (await openPicker(page)).getByRole("searchbox", { name: "Buscar fonte" }).fill("courg");
  await page.getByRole("button", { name: "Courgette (Cursiva)" }).click();
  await expect(page.getByText(/as letras não se unem/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/menos de 0,4 mm/)).toHaveCount(0);

  // favorita continua lá depois de reabrir o app
  await page.reload();
  await go(page, "Chaveiros");
  const again = await openPicker(page);
  await again.getByRole("button", { name: "Favoritas", exact: true }).click();
  await expect(again.getByRole("listitem")).toHaveCount(1);
});

test("importar .ttf: vira 'Minhas', gera o chaveiro, fica salva e pode ser removida (#20)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Chaveiros");
  let sheet = await openPicker(page);
  await sheet.getByLabel("Arquivo de fonte").setInputFiles({ name: "quebrado.ttf", mimeType: "font/ttf", buffer: Buffer.from("não é fonte") });
  await expect(sheet.getByText("Este arquivo não é uma fonte válida.")).toBeVisible();

  await sheet.getByLabel("Arquivo de fonte").setInputFiles({ name: "MinhaFonte.ttf", mimeType: "font/ttf", buffer: FONT_FILE });
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: /^Fonte: Rubik Mono One Regular\./ })).toBeVisible();
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);

  await page.reload();
  await go(page, "Chaveiros");
  sheet = await openPicker(page);
  await sheet.getByRole("button", { name: "Minhas", exact: true }).click();
  await expect(sheet.getByRole("listitem")).toHaveCount(1);
  await sheet.getByRole("button", { name: "Remover Rubik Mono One Regular" }).click();
  await expect(sheet.getByRole("button", { name: "Minhas", exact: true })).toHaveCount(0);
});

test("modelos prontos usam o mesmo seletor (topo de bolo em Anton) (#20)", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Topo de bolo");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Topo de bolo", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  const before = await hud(page).textContent();
  const sheet = await openPicker(page);
  await sheet.getByRole("searchbox", { name: "Buscar fonte" }).fill("anton");
  await sheet.getByRole("button", { name: "Anton (Grossa)" }).click();
  await expect(page.getByRole("button", { name: /^Fonte: Anton\./ })).toBeVisible();
  await expect(hud(page)).not.toHaveText(before!, { timeout: 60_000 });
});

/** Resposta do Claude em SSE (o app usa messages.stream). */
function sse(text: string): string {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const usage = { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  return [
    ev("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, stop_sequence: null, usage } }),
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    ev("content_block_delta", { index: 0, delta: { type: "text_delta", text } }),
    ev("content_block_stop", { index: 0 }),
    ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } }),
    ev("message_stop", {}),
  ].join("");
}

test("Pedir à IA: o prompt lista as fontes novas e o OpenSCAD renderiza com uma delas (#20)", async ({ page, tauri }) => {
  let system = "";
  await page.route("https://api.anthropic.com/v1/messages**", async (route) => {
    system = JSON.stringify(route.request().postDataJSON().system);
    const code = '// @part placa #2563eb Placa\n// @part nome #f97316 Nome\nmodule placa() { cube([60, 20, 2]); }\nmodule nome() { translate([4, 5, 2]) linear_extrude(1.5) text("Ana", size = 10, font = "Montserrat"); }';
    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: sse(`Placa com o nome em Montserrat.\n\n\`\`\`openscad\n${code}\n\`\`\``) });
  });
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.prepare("INSERT INTO secrets (key, value) VALUES ('anthropic_api_key', ?)").run(`sk-ant-${"x".repeat(30)}`);
  await go(page, "Pedir à IA");
  await page.getByPlaceholder(/Descreva a peça/).fill("placa com o nome Ana em Montserrat");
  await page.getByRole("button", { name: "Criar peça" }).click();
  await expect(hud(page)).toContainText("mm", { timeout: 90_000 });
  expect(system).toContain('\\"Montserrat\\"');
  expect(system).toContain('\\"Great Vibes\\"');
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
});
