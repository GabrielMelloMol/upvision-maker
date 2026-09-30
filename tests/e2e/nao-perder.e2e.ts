import { expect, go, openApp, test, toastWith } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;

test("chaveiro: desfazer/refazer, rascunho guardado (Continuar / Começar do zero), aviso ao sair e últimos projetos (#85)", async ({ page, tauri }) => {
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
