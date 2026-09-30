import { expect, go, openApp, test, toastWith } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;

test("chaveiro: desfazer/refazer, rascunho guardado (Continuar / Começar do zero), aviso ao sair e últimos projetos (#85)", async ({ page, tauri }) => {
  test.slow(); // prévia 3D ida e volta: com a suíte inteira em paralelo passa de 60 s
  await openApp(page);
  await go(page, "Chaveiros");
  const text = page.getByLabel("Texto", { exact: true });
  await text.fill("Mariana");
  await page.getByLabel(/^Altura do texto/).fill("18");
  await page.locator("h1").click(); // fora dos campos: ⌘Z é da ferramenta
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByLabel(/^Altura do texto/)).toHaveValue("14");
  await expect(text).toHaveValue("Mariana");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveValue("Ana"); // digitar seguido conta como um passo só
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveValue("Mariana");

  // sair avisa (nada se perde) e o rascunho vai para o banco
  await expect.poll(() => (tauri.db.prepare("SELECT data FROM tool_state WHERE id = 'keychain'").get() as { data?: string } | undefined)?.data ?? "").toContain("Mariana");
  await go(page, "Medalhas");
  await expect(toastWith(page, "Chaveiro: seu trabalho ficou guardado")).toBeVisible();

  // voltar depois de reabrir o app: oferece continuar
  await page.reload();
  await go(page, "Chaveiros");
  await expect(page.getByText(/Você tem um trabalho guardado de/)).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/continuar.png` });
  await page.getByRole("button", { name: "Continuar de onde parou" }).click();
  await expect(page.getByLabel("Texto", { exact: true })).toHaveValue("Mariana");

  // salvar o 3MF guarda o projeto; reabrir volta os campos
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  await page.getByLabel("Texto", { exact: true }).fill("Outro");
  await page.getByRole("button", { name: /Últimos projetos \(1\)/ }).click();
  const sheet = page.getByRole("dialog", { name: "Últimos projetos" });
  await expect(sheet.getByRole("listitem")).toHaveCount(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ultimos-projetos.png` });
  await sheet.getByRole("button", { name: /^Reabrir chaveiro-Mariana/ }).click();
  await expect(page.getByLabel("Texto", { exact: true })).toHaveValue("Mariana");

  // começar do zero apaga o rascunho
  await page.reload();
  await go(page, "Chaveiros");
  await page.getByRole("button", { name: "Começar do zero" }).click();
  await expect(page.getByText(/Você tem um trabalho guardado/)).toHaveCount(0);
  await expect.poll(() => tauri.db.prepare("SELECT COUNT(*) AS n FROM tool_state WHERE id = 'keychain'").get()).toEqual({ n: 0 });
});

test("litofania: a foto volta junto no Continuar; medalha tem desfazer (#85)", async ({ page, tauri }) => {
  test.slow(); // prévia 3D ida e volta: com a suíte inteira em paralelo passa de 60 s
  await openApp(page);
  await go(page, "Litofania e quadro");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/foto-pessoa.jpg");
  await expect(page.getByRole("img", { name: "Simulação da litofania contra a luz" })).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => (tauri.db.prepare("SELECT data FROM tool_state WHERE id = 'lithophane'").get() as { data?: string } | undefined)?.data ?? "", { timeout: 15_000 }).toContain("data:image/jpeg;base64");
  await page.reload();
  await go(page, "Litofania e quadro");
  await page.getByRole("button", { name: "Continuar de onde parou" }).click();
  await expect(page.getByRole("img", { name: "Simulação da litofania contra a luz" })).toBeVisible({ timeout: 90_000 });

  await go(page, "Medalhas");
  const size = page.getByLabel(/^Tamanho/).first();
  const before = await size.inputValue();
  await size.fill("80");
  await page.locator("h1").click();
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(size).toHaveValue(before);
});

test("modelos prontos: continuar volta o mesmo modelo e os campos; desfazer vale para campo e camada juntos (#85)", async ({ page }) => {
  test.slow(); // prévia 3D ida e volta: com a suíte inteira em paralelo passa de 60 s
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Placa de sinalização");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Placa de sinalização", exact: true }).click();
  const first = page.locator(".controls").getByLabel("Texto", { exact: true });
  await first.fill("Caixa");
  await page.getByRole("region", { name: "Camadas livres" }).getByRole("button", { name: "Adicionar texto" }).click();
  await expect(page.getByRole("region", { name: "Camadas livres" }).getByRole("listitem")).toHaveCount(1);
  await page.locator("h1").click();
  await page.keyboard.press("ControlOrMeta+z"); // desfaz a camada
  await expect(page.getByRole("region", { name: "Camadas livres" }).getByRole("listitem")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z"); // desfaz o campo
  await expect(first).not.toHaveValue("Caixa");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(first).toHaveValue("Caixa");
  await page.waitForTimeout(1500); // rascunho grava depois de parar de mexer
  await page.reload();
  await go(page, "Modelos prontos");
  await page.getByRole("button", { name: "Continuar de onde parou" }).click();
  await expect(page.getByRole("heading", { name: "Placa de sinalização", level: 2 })).toBeVisible();
  await expect(page.locator(".controls").getByLabel("Texto", { exact: true })).toHaveValue("Caixa");
});
