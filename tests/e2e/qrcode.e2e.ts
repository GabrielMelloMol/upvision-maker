import { unzipSync, strFromU8 } from "fflate";
import { pixPayload } from "../../src/domain/pix";
import { qrSvg, wifiPayload } from "../../src/domain/qr";
import { expect, go, openApp, test, toastWith } from "./tauri";

test("QR Pix: usa os dados da empresa, salva SVG idêntico ao BR Code e 3MF em 2 cores", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db
    .prepare("INSERT INTO company (id, data) VALUES (1, ?)")
    .run(JSON.stringify({ name: "Ateliê da Ana", pixKey: "fulano@exemplo.com", pixName: "Ana Souza", pixCity: "Niterói" }));
  await go(page, "QR Code e Pix");
  await expect(page.getByLabel("Chave Pix")).toHaveValue("fulano@exemplo.com");
  await expect(page.getByLabel("Nome de quem recebe")).toHaveValue("Ana Souza");
  await page.getByLabel("Valor (opcional)").fill("25,5");
  await page.getByLabel("Identificador (opcional)").fill("PED 42"); // espaço é removido
  await expect(page.getByLabel("Identificador (opcional)")).toHaveValue("PED42");

  const expected = pixPayload({ key: "fulano@exemplo.com", name: "Ana Souza", city: "Niterói", amount: 25.5, txid: "PED42" });
  await page.getByRole("button", { name: /Salvar SVG/ }).click();
  await expect(toastWith(page, "SVG salvo em")).toBeVisible();
  const svg = [...tauri.files].find(([p]) => p.endsWith("pix.svg"))![1].toString();
  expect(svg).toBe(qrSvg(expected, 50));

  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator(".viewer .hud")).toContainText("50.0 × 50.0 × 3.0 mm", { timeout: 60_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const model = strFromU8(unzipSync(new Uint8Array([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1]))["3D/3dmodel.model"]);
  expect((model.match(/<object /g) ?? []).length).toBeGreaterThanOrEqual(2);
});

test("QR Wi-Fi e erros amigáveis", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "QR Code e Pix");
  await page.getByRole("button", { name: "Wi-Fi", exact: true }).click();
  await expect(page.getByText("Informe o nome da rede Wi-Fi.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Salvar SVG/ })).toBeDisabled();
  await page.getByLabel("Nome da rede").fill("Ateliê");
  await page.getByLabel("Senha").fill("abc;12345");
  await page.getByRole("button", { name: /Salvar SVG/ }).click();
  await expect(toastWith(page, "SVG salvo em")).toBeVisible();
  const svg = [...tauri.files].find(([p]) => p.endsWith(".svg"))![1].toString();
  expect(svg).toBe(qrSvg(wifiPayload({ ssid: "Ateliê", password: "abc;12345", security: "WPA" }), 50));
});
