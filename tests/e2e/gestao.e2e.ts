import { expect, go, openApp, test } from "./tauri";

test("navegação: todas as páginas da sidebar abrem com título", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const labels = await nav.locator("button.nav").allInnerTexts();
  expect(labels.length).toBeGreaterThanOrEqual(12);
  for (const label of labels) {
    await nav.getByRole("button", { name: label.trim(), exact: true }).click();
    await expect(page.locator("main h1").first()).toBeVisible();
  }
  // cards da Início levam às ferramentas
  await go(page, "Início");
  await page.getByRole("main").getByRole("button", { name: /Calculadora/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Calculadora de preço" })).toBeVisible();
});

test("preferências: salva e persiste valores; recusa valor inválido", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Preferências");
  const kwh = page.getByLabel("Preço do kWh (R$)");
  await kwh.fill("1,15");
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Preferências salvas." })).toBeVisible();
  const saved = tauri.db.prepare("SELECT data FROM settings WHERE id = 1").get() as { data: string };
  expect(JSON.parse(saved.data).kwhPrice).toBe(1.15);

  await go(page, "Início");
  await go(page, "Preferências");
  await expect(page.getByLabel("Preço do kWh (R$)")).toHaveValue("1,15");

  await page.getByLabel("Manutenção (%)").fill("abc");
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(page.locator("label", { hasText: "Manutenção (%)" }).locator(".error")).toBeVisible();
});

test("impressoras: adiciona, edita e exclui", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras");
  await page.getByLabel("Nome").fill("Bambu A1");
  await page.getByLabel("Potência média (W)").fill("95");
  await page.getByRole("button", { name: "Adicionar" }).click();
  const row = page.getByRole("row", { name: /Bambu A1/ });
  await expect(row).toContainText("95");

  await row.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Potência média (W)").fill("110");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("row", { name: /Bambu A1/ })).toContainText("110");

  await page.getByRole("row", { name: /Bambu A1/ }).getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByRole("row", { name: /Bambu A1/ })).toHaveCount(0);
  expect(tauri.calls).toContain("plugin:dialog|message");
});

test("impressoras: nome vazio mostra erro no campo", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Impressoras");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.locator("label", { hasText: "Nome" }).locator(".error")).toHaveText("Obrigatório.");
  await expect(page.locator("label", { hasText: "Potência" }).locator(".error")).toHaveText("Digite um número.");
});

test("filamentos: estoque baixo e reposição com custo médio ponderado", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Filamentos");
  await page.getByLabel("Cor").fill("Preto");
  await page.getByLabel("Marca").fill("Voolt");
  await page.getByLabel("Preço por kg").fill("100");
  await page.getByLabel("Estoque (g)").fill("100");
  await page.getByRole("button", { name: "Adicionar" }).click();
  const row = page.getByRole("row", { name: /Preto/ });
  await expect(row).toContainText("estoque baixo");

  await row.getByRole("button", { name: "Repor" }).click();
  await page.getByLabel("Gramas compradas").fill("900");
  await page.getByLabel("Preço pago por kg").fill("120");
  await page.getByRole("button", { name: "Confirmar reposição" }).click();
  // (100 g × 100 + 900 g × 120) / 1000 g = R$ 118,00/kg
  await expect(page.getByRole("row", { name: /Preto/ })).toContainText("R$ 118,00");
  await expect(page.getByRole("row", { name: /Preto/ })).not.toContainText("estoque baixo");
  const f = tauri.db.prepare("SELECT stockG, pricePerKg FROM filaments").get() as { stockG: number; pricePerKg: number };
  expect(f).toEqual({ stockG: 1000, pricePerKg: 118 });
});

test("materiais extras: cadastro com unidade e preço", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Materiais extras");
  await page.getByLabel("Nome").fill("Argola");
  await page.getByLabel("Preço por unidade").fill("0,35");
  await page.getByLabel("Estoque", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByRole("row", { name: /Argola/ })).toContainText("R$ 0,35");
});

test("calculadora: exemplo da home dá R$ 15,96 / 47,88 / 79,80", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Calculadora");
  const main = page.getByRole("main");
  await main.getByLabel("Preço por kg (R$)").fill("85");
  await main.getByLabel("Gramas").fill("120");
  await main.getByRole("button", { name: "Adicionar" }).nth(1).click(); // linha de material extra
  await main.getByLabel("Preço unitário (R$)").fill("5");
  await main.getByLabel("Quantidade").fill("1");
  await expect(page.getByRole("row", { name: /Custo por peça/ })).toContainText("R$ 15,96");
  await expect(page.getByRole("row", { name: /Revenda/ })).toContainText("R$ 47,88");
  await expect(page.getByRole("row", { name: /Consumidor final/ })).toContainText("R$ 79,80");
});

test("backup: salva JSON e restaura substituindo os dados (com cópia de segurança)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras");
  await page.getByLabel("Nome").fill("Ender 3");
  await page.getByLabel("Potência média (W)").fill("150");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByRole("row", { name: /Ender 3/ })).toBeVisible();

  await page.getByRole("button", { name: "Fazer backup" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Backup salvo em" })).toBeVisible();
  const [path, bytes] = [...tauri.files].find(([p]) => p.includes("upvision-backup-"))!;
  const backup = JSON.parse(bytes.toString());
  expect(backup.app).toBe("upvision-maker");
  expect(backup.tables.printers).toHaveLength(1);

  // muda os dados e restaura o backup
  tauri.db.exec("DELETE FROM printers");
  tauri.nextOpen = path;
  await page.getByRole("button", { name: "Restaurar backup" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Backup restaurado" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Ender 3/ })).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.startsWith("/dados-app/backups/antes-de-restaurar-"))).toBe(true);
});

test("backup: arquivo que não é backup mostra erro e não apaga nada", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec("CREATE TABLE IF NOT EXISTS _x (a)"); // garante que o banco já existe
  tauri.files.set("/qualquer.json", Buffer.from('{"foo": 1}'));
  tauri.nextOpen = "/qualquer.json";
  await page.getByRole("button", { name: "Restaurar backup" }).click();
  await expect(page.getByRole("status").filter({ hasText: "não é um backup do UpVision Maker" })).toBeVisible();
});
