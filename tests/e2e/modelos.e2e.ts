import { unzipSync, strFromU8 } from "fflate";
import { expect, go, openApp, test, toastWith } from "./tauri";

const MODELS = ["Placa Pix", "Topo de bolo", "Carimbo", "Marca-página", "Porta-caneta", "Chaveiro giratório", "Chaveiro NFC", "Troféu"];

test("Modelos prontos: cada modelo gera prévia 3D sem erro", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.prepare("INSERT INTO company (id, data) VALUES (1, ?)").run(JSON.stringify({ name: "Ateliê da Ana", pixKey: "fulano@exemplo.com", pixName: "Ana Souza", pixCity: "Niterói" }));
  await go(page, "Modelos prontos");
  const gallery = page.getByRole("group", { name: "Modelo" });
  for (const name of MODELS) {
    await gallery.getByRole("button", { name, exact: true }).click();
    await expect(gallery.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
    await expect(page.locator(".viewer .overlay")).toHaveCount(0);
  }
});

test("Placa Pix usa os dados da empresa; chaveiro NFC salva 3MF com a pausa", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.prepare("INSERT INTO company (id, data) VALUES (1, ?)").run(JSON.stringify({ name: "Ateliê da Ana", pixKey: "fulano@exemplo.com", pixName: "Ana Souza", pixCity: "Niterói" }));
  await go(page, "Modelos prontos");
  await expect(page.getByLabel("Chave Pix")).toHaveValue("fulano@exemplo.com");
  await expect(page.getByLabel("Embaixo do QR")).toHaveValue("Ateliê da Ana");

  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Chaveiro NFC" }).click();
  await expect(page.getByText(/Pausa em Z = 2,00 mm/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const file = [...tauri.files].find(([p]) => p.endsWith(".3mf"))![1];
  const xml = strFromU8(unzipSync(new Uint8Array(file))["Metadata/custom_gcode_per_layer.xml"]);
  expect(xml).toContain('top_z="2"');

  // camada de 0,12 mm muda a altura da pausa
  await page.getByLabel(/Altura de camada/).fill("0.12");
  await expect(page.getByText(/Pausa em Z = 2,04 mm/)).toBeVisible({ timeout: 60_000 });
});

test("Modelos prontos: campo fora da faixa não gera modelo", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Porta-caneta" }).click();
  await page.getByLabel(/^Altura \(mm\)/).fill("5");
  await expect(page.getByText("Corrija os campos em vermelho.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Salvar 3MF/ })).toBeDisabled();
  expect(tauri.files.size).toBe(0);
});
