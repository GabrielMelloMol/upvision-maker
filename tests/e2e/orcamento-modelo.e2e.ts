import { writeFileSync } from "node:fs";
import { expect, go, openApp, test, toastWith } from "./tauri";

// #301: orçamento no modelo da Bia. SHOTS=<pasta> guarda prints das telas e o PDF para conferir à mão.
const SHOTS = process.env.SHOTS;

test("orçamento no modelo da Bia: logo para fundo escuro, frase e cor de destaque na empresa; imagem, cor e tamanho no orçamento", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Dados da empresa");
  await page.getByLabel("Nome / razão social").fill("UpVision 3D");
  await page.locator("input[type=file]").first().setInputFiles("tests/fixtures/logo.jpg");
  await expect(toastWith(page, "Logo salvo.")).toBeVisible();
  await page.locator("label", { hasText: "Enviar logo para fundo escuro" }).locator("input[type=file]").setInputFiles("src-tauri/icons/128x128.png");
  await expect(page.getByRole("img", { name: "Logo para fundo escuro" })).toBeVisible();
  await page.getByRole("button", { name: "Pôr linha de destaque" }).click();
  await page.getByLabel("Frase da empresa").fill("Impressão 3D e personalizados");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/empresa.png`, fullPage: true });
  await page.getByRole("button", { name: "Salvar dados" }).click();
  await expect(toastWith(page, "Dados da empresa salvos.")).toBeVisible();
  const company = JSON.parse((tauri.db.prepare("SELECT data FROM company").get() as { data: string }).data);
  expect(company).toMatchObject({ slogan: "Impressão 3D e personalizados", accentColor: "#F97316" });
  expect(company.logoDark).toMatch(/^data:image\/png;base64,/);

  await go(page, "Orçamentos");
  await page.getByRole("button", { name: "Novo orçamento" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Novo orçamento" });
  await sheet.getByLabel("Nome do cliente").fill("Val - Clínica Estética");
  await sheet.getByRole("button", { name: "Adicionar item" }).click();
  await sheet.getByLabel("Descrição").fill("Peça em formato de perfil de rosto");
  await sheet.getByLabel("Preço un.").fill("60");
  await sheet.locator("fieldset", { hasText: "Referência do projeto 3D" }).locator("input[type=file]").setInputFiles("tests/fixtures/foto.jpg");
  await expect(sheet.getByRole("img", { name: "Imagem de referência" })).toBeVisible();
  await sheet.getByLabel("Cor", { exact: true }).fill("A definir");
  await sheet.getByLabel("Tamanho", { exact: true }).fill("25 cm");
  if (SHOTS) await sheet.screenshot({ path: `${SHOTS}/orcamento-editor.png` });
  await sheet.getByRole("button", { name: "Criar orçamento" }).click();
  await expect(page.locator(".toast", { hasText: /Orçamento ORC-\d{4}-001 criado\./ })).toBeVisible();
  const quote = JSON.parse((tauri.db.prepare("SELECT data FROM quotes").get() as { data: string }).data);
  expect(quote).toMatchObject({ refColor: "A definir", refSize: "25 cm" });
  expect(quote.refImage).toMatch(/^data:image\/jpeg;base64,/);

  await page.getByRole("row", { name: /Val - Clínica Estética/ }).getByRole("button", { name: "PDF" }).click();
  await expect(toastWith(page, "Orçamento salvo em")).toBeVisible();
  const pdf = [...tauri.files].find(([p]) => p.endsWith(".pdf"))![1];
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  if (SHOTS) writeFileSync(`${SHOTS}/orcamento.pdf`, pdf);
});
