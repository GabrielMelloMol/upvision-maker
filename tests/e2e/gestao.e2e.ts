import { expect, go, openApp, test, toastWith } from "./tauri";

test("navegação: todas as páginas da sidebar abrem com título", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const labels = await nav.locator(".scroll button.nav").allInnerTexts();
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
  const kwh = page.getByLabel("Preço do kWh");
  await kwh.fill("1,15");
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(toastWith(page, "Preferências salvas.")).toBeVisible();
  const saved = tauri.db.prepare("SELECT data FROM settings WHERE id = 1").get() as { data: string };
  expect(JSON.parse(saved.data).kwhPrice).toBe(1.15);

  await go(page, "Início");
  await go(page, "Preferências");
  await expect(page.getByLabel("Preço do kWh")).toHaveValue("1,15");

  await page.getByLabel("Manutenção (%)").fill("abc");
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(page.locator(".field", { hasText: "Manutenção (%)" }).locator(".error")).toBeVisible();
});

test("impressoras: adiciona, edita e exclui", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras");
  await page.getByLabel("Nome").fill("Bambu A1");
  await page.getByLabel("Potência média (W)").fill("95");
  await page.getByRole("button", { name: "Adicionar" }).click();
  const row = page.getByRole("row", { name: /Bambu A1/ });
  await expect(row).toContainText("95");
  await expect(page.getByText("Nada cadastrado ainda.")).toBeHidden();

  await row.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Potência média (W)").fill("110");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("row", { name: /Bambu A1/ })).toContainText("110");

  // excluir some na hora e dá para desfazer; sem diálogo de confirmação
  await page.getByRole("row", { name: /Bambu A1/ }).getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByRole("row", { name: /Bambu A1/ })).toHaveCount(0);
  await toastWith(page, "excluído").getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("row", { name: /Bambu A1/ })).toBeVisible();
  expect(tauri.calls).not.toContain("plugin:dialog|message");

  // sem desfazer: sai do banco depois do prazo
  await page.clock.install();
  await page.getByRole("row", { name: /Bambu A1/ }).getByRole("button", { name: "Excluir" }).click();
  await page.clock.runFor(8500);
  await expect.poll(() => tauri.db.prepare("SELECT COUNT(*) AS n FROM printers").get()).toEqual({ n: 0 });
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
  await page.getByRole("radio", { name: "Preto" }).click();
  await page.getByLabel("Marca").fill("Voolt");
  await page.getByLabel("Preço por kg").fill("100");
  await page.getByLabel("Estoque", { exact: true }).fill("100 g");
  await page.getByRole("button", { name: "Adicionar" }).click();
  const row = page.getByRole("row", { name: /Preto/ });
  await expect(row).toContainText("estoque baixo");

  await row.getByRole("button", { name: "Repor" }).click();
  await page.getByLabel("Quanto comprou").fill("900");
  await page.getByLabel("Preço pago por kg").fill("R$ 120");
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

test("calculadora: exemplo da home com os padrões (falha 5%) dá R$ 15,74 / 47,21 / 78,68", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Calculadora");
  await page.getByRole("button", { name: "Completo" }).click(); // abre no Rápido (#22)
  const main = page.getByRole("main");
  await main.getByLabel("Preço por kg").fill("85");
  await main.getByLabel("Gramas").fill("120");
  await main.getByRole("button", { name: "Adicionar material" }).click();
  await main.getByLabel("Preço unitário").fill("5");
  await main.getByLabel("Quantidade").fill("1");
  await expect(page.getByRole("row", { name: /Custo por peça/ })).toContainText("R$ 15,74");
  await expect(page.getByRole("row", { name: /Falhas/ })).toContainText("R$ 0,54");
  await expect(page.getByRole("row", { name: /Para lojista/ })).toContainText("R$ 47,21");
  await expect(page.getByRole("row", { name: /Venda direta/ })).toContainText("R$ 78,68");
});

test("backup: salva JSON e restaura substituindo os dados (com cópia de segurança)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras");
  await page.getByLabel("Nome").fill("Ender 3");
  await page.getByLabel("Potência média (W)").fill("150");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByRole("row", { name: /Ender 3/ })).toBeVisible();

  await page.getByRole("button", { name: "Fazer backup" }).click();
  await expect(toastWith(page, "Backup salvo em")).toBeVisible();
  const [path, bytes] = [...tauri.files].find(([p]) => p.includes("upvision-backup-"))!;
  const backup = JSON.parse(bytes.toString());
  expect(backup.app).toBe("upvision-maker");
  expect(backup.tables.printers).toHaveLength(1);

  // muda os dados e restaura o backup
  tauri.db.exec("DELETE FROM printers");
  tauri.nextOpen = path;
  await page.getByRole("button", { name: "Restaurar backup" }).click();
  await expect(toastWith(page, "Backup restaurado")).toBeVisible();
  await expect(page.getByRole("row", { name: /Ender 3/ })).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.startsWith("/dados-app/backups/antes-de-restaurar-"))).toBe(true);
});

test("backup: arquivo que não é backup mostra erro e não apaga nada", async ({ page, tauri }) => {
  await openApp(page);
  tauri.db.exec("CREATE TABLE IF NOT EXISTS _x (a)"); // garante que o banco já existe
  tauri.files.set("/qualquer.json", Buffer.from('{"foo": 1}'));
  tauri.nextOpen = "/qualquer.json";
  await page.getByRole("button", { name: "Restaurar backup" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "não é um backup do UpVision Maker" })).toBeVisible();
});

test("primeiro uso: apresentação em 3 passos grava custos, impressora e filamento", async ({ page, tauri }) => {
  await openApp(page, { keepOnboarding: true });
  const sheet = page.getByRole("dialog", { name: "Boas-vindas ao UpVision Maker" });
  await sheet.getByLabel("Preço do kWh").fill("1,05");
  await sheet.getByRole("button", { name: "Continuar" }).click();
  await sheet.getByRole("button", { name: "Continuar" }).click(); // nome vazio → erro
  await expect(sheet.locator("label", { hasText: "Nome" }).locator(".error")).toHaveText("Obrigatório.");
  await sheet.getByLabel("Nome").fill("Bambu Lab A1");
  await sheet.getByLabel("Potência média (W)").fill("95");
  await sheet.getByRole("button", { name: "Continuar" }).click();
  await sheet.getByRole("radio", { name: "Branco" }).click();
  await sheet.getByLabel("Preço por kg").fill("99,90");
  await sheet.getByRole("button", { name: "Concluir" }).click();
  await expect(sheet).toBeHidden();
  await expect(toastWith(page, "Tudo pronto")).toBeVisible();

  expect(JSON.parse((tauri.db.prepare("SELECT data FROM settings").get() as { data: string }).data).kwhPrice).toBe(1.05);
  expect(tauri.db.prepare("SELECT name, watts FROM printers").all()).toEqual([{ name: "Bambu Lab A1", watts: 95 }]);
  expect(tauri.db.prepare("SELECT color, pricePerKg, stockG FROM filaments").all()).toEqual([{ color: "Branco", pricePerKg: 99.9, stockG: 1000 }]);

  // não aparece de novo
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("modal: Esc fecha e o foco volta ao botão que abriu", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  const opener = page.getByRole("button", { name: "Sugerir ferramenta" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Sugerir ferramenta" });
  await expect(dialog.getByLabel("O que você queria que o app fizesse?")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("filamentos: cor em bolinhas, '2 rolos' vira 2000 g e campos lembrados no próximo cadastro", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Filamentos");
  await expect(page.getByLabel("Material")).toBeFocused(); // lista vazia: cursor já no 1º campo
  await page.getByLabel("Material").selectOption("PETG");
  await page.getByRole("radio", { name: "Azul", exact: true }).click();
  await page.getByLabel("Marca").fill("3D Fila");
  await page.getByLabel("Preço por kg").fill("119,9");
  const stock = page.getByLabel("Estoque", { exact: true });
  await stock.fill("2 rolos");
  await stock.blur();
  await expect(page.locator(".field", { hasText: "Estoque" }).locator(".hint.ok")).toContainText("2.000 g (2 rolos)");
  await page.getByLabel("Marca").press("Enter"); // Enter salva
  await expect(page.getByRole("row", { name: /PETG/ })).toContainText("2.000 g");
  expect(tauri.db.prepare("SELECT material, color, brand, pricePerKg, stockG FROM filaments").get()).toEqual({ material: "PETG", color: "Azul", brand: "3D Fila", pricePerKg: 119.9, stockG: 2000 });
  // material, marca e preço continuam para o próximo rolo; a cor não
  await expect(page.getByLabel("Material")).toHaveValue("PETG");
  await expect(page.getByLabel("Marca")).toHaveValue("3D Fila");
  await expect(page.getByRole("radio", { name: "Azul", exact: true })).toHaveAttribute("aria-checked", "false");
});

test("campo inteligente: erro só ao sair do campo e some ao corrigir", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Filamentos");
  const stock = page.getByLabel("Estoque", { exact: true });
  const err = page.locator(".field", { hasText: "Estoque" }).locator(".error");
  await stock.fill("dois");
  await expect(err).toHaveCount(0); // não pune enquanto digita
  await stock.blur();
  await expect(err).toContainText("Use gramas");
  await stock.fill("2 rolos"); // já errou: valida ao vivo
  await expect(err).toHaveCount(0);
});

test("calculadora: tempo num campo só ('3h20') e mão de obra em minutos", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Calculadora");
  await page.getByRole("button", { name: "Completo" }).click(); // abre no Rápido (#22)
  const main = page.getByRole("main");
  await main.getByLabel("Potência (W)").fill("1000");
  await main.getByLabel("Tempo de impressão").fill("3h20");
  await main.getByLabel("Tempo de impressão").blur();
  await expect(main.locator(".field", { hasText: "Tempo de impressão" }).locator(".hint.ok")).toContainText("3h20 (200 min)");
  // 1 kW × 3,333 h × R$ 0,90 = R$ 3,00
  await expect(page.getByRole("row", { name: /Energia/ })).toContainText("R$ 3,00");
  await main.getByLabel("Tempo de impressão").fill("200 min");
  await expect(page.getByRole("row", { name: /Energia/ })).toContainText("R$ 3,00");
  await main.getByLabel("Frete absorvido por peça").fill("1234,5");
  await main.getByLabel("Frete absorvido por peça").blur();
  await expect(main.getByLabel("Frete absorvido por peça")).toHaveValue("1.234,50");
});

test("busca global: Ctrl+K acha tela e registro; Enter abre o filamento em edição", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.exec("INSERT INTO filaments (material, color, brand, pricePerKg, spoolG, stockG, minG) VALUES ('PLA','Rosa','Voolt',99,1000,500,200)");
  await go(page, "Início");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Buscar" });
  await expect(palette.getByRole("combobox")).toBeFocused();
  await palette.getByRole("combobox").fill("calc");
  await expect(palette.getByRole("option").first()).toContainText("Calculadora");
  await palette.getByRole("combobox").fill("rosa voolt");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(page.getByRole("heading", { name: "Editar filamento" })).toBeVisible();
  await expect(page.getByLabel("Marca")).toHaveValue("Voolt");
});

test("Ctrl+N na página de cadastro: limpa a edição e foca o 1º campo", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras");
  tauri.db.exec("INSERT INTO printers (name, watts) VALUES ('Ender', 150)");
  await go(page, "Início");
  await go(page, "Impressoras");
  await page.getByRole("row", { name: /Ender/ }).getByRole("button", { name: "Editar" }).click();
  await expect(page.getByLabel("Nome")).toHaveValue("Ender");
  await page.locator("body").press("Control+n");
  await expect(page.getByRole("heading", { name: "Adicionar impressora" })).toBeVisible();
  await expect(page.getByLabel("Nome")).toBeFocused();
  await expect(page.getByLabel("Nome")).toHaveValue("");
});
