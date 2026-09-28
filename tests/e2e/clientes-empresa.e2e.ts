import { expect, go, openApp, test, toastWith } from "./tauri";

test("clientes: cadastra com CEP preenchendo o endereço, valida CPF e busca na lista", async ({ page, tauri }) => {
  await page.route("https://viacep.com.br/ws/01310100/json/", (r) => r.fulfill({ json: { logradouro: "Avenida Paulista", bairro: "Bela Vista", localidade: "São Paulo", uf: "SP" } }));
  await openApp(page);
  await go(page, "Clientes");
  await page.getByRole("button", { name: "Novo cliente" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Novo cliente" });
  await sheet.getByLabel("Nome").fill("Ana Souza");
  await sheet.getByLabel("CPF (opcional)").fill("111.111.111-11");
  await sheet.getByLabel("CEP", { exact: true }).fill("01310100");
  await expect(sheet.getByLabel("Rua")).toHaveValue("Avenida Paulista");
  await expect(sheet.getByLabel("UF")).toHaveValue("SP");
  await sheet.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(sheet.getByText("CPF inválido")).toBeVisible();
  await sheet.getByLabel("CPF (opcional)").fill("529.982.247-25");
  await sheet.getByLabel("Desconto padrão (%)").fill("10");
  await sheet.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(toastWith(page, "Cliente cadastrado.")).toBeVisible();
  const row = page.getByRole("row", { name: /Ana Souza/ });
  await expect(row).toContainText("529.982.247-25");
  await expect(row).toContainText("São Paulo/SP");
  await expect(row).toContainText("10%");
  const saved = tauri.db.prepare("SELECT document, active FROM customers").get() as { document: string; active: number };
  expect(saved).toEqual({ document: "52998224725", active: 1 });
  await page.getByLabel("Buscar").fill("paulo");
  await expect(page.getByRole("row", { name: /Ana Souza/ })).toBeVisible();
  await page.getByLabel("Buscar").fill("zzz");
  await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible();
});

test("empresa: chave Pix inválida avisa na hora; válida mostra QR e salva", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Dados da empresa");
  await page.getByLabel("Nome / razão social").fill("UpVision 3D");
  await page.getByLabel("Cidade", { exact: true }).first().fill("Rio de Janeiro");
  await page.getByLabel("Chave Pix").fill("123.456.789-00");
  await expect(page.getByText(/CPF da chave Pix inválido/)).toBeVisible();
  await page.getByLabel("Chave Pix").fill("529.982.247-25");
  await expect(page.getByRole("img", { name: "Prévia do QR Pix" })).toBeVisible();
  await page.getByRole("button", { name: "Salvar dados" }).click();
  await expect(toastWith(page, "Dados da empresa salvos.")).toBeVisible();
  const row = tauri.db.prepare("SELECT data FROM company").get() as { data: string };
  expect(JSON.parse(row.data)).toMatchObject({ name: "UpVision 3D", pixKey: "52998224725" });
});
