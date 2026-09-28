import type { Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { expect, go, openApp, test, toastWith } from "./tauri";

/** Acha o modelo pela busca (a galeria mostra uma categoria por vez). */
async function pickModel(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(name);
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name, exact: true }).click();
}


const MODELS = ["Placa Pix", "Topo de bolo", "Carimbo", "Marca-página", "Porta-caneta", "Chaveiro giratório", "Chaveiro NFC", "Troféu"];

test("Modelos prontos: cada modelo gera prévia 3D sem erro", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.prepare("INSERT INTO company (id, data) VALUES (1, ?)").run(JSON.stringify({ name: "Ateliê da Ana", pixKey: "fulano@exemplo.com", pixName: "Ana Souza", pixCity: "Niterói" }));
  await go(page, "Modelos prontos");
  const gallery = page.getByRole("group", { name: "Modelo" });
  for (const name of MODELS) {
    await pickModel(page, name);
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

  await pickModel(page, "Chaveiro NFC");
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
  await pickModel(page, "Porta-caneta");
  await page.getByLabel(/^Altura \(mm\)/).fill("5");
  await expect(page.getByText("Corrija os campos em vermelho.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Salvar 3MF/ })).toBeDisabled();
  expect(tauri.files.size).toBe(0);
});

const GIFTS_SPORT = [
  "Medalha adaptável",
  "Troféu elegante",
  "Troféu adaptável",
  "Chaveiro anilha",
  "Nome articulado",
  "Chaveiro abridor",
  "Clicker",
  "MOLLE tag",
  "Plaquinha de colorir",
  "Totem NFC",
  "Porta-joia NFC",
  "Porta-chave de parede",
  "Luminária",
];
const LOGO = { name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="#2563eb" d="M0 0H20V20H0Z"/><path fill="#f8f8f6" d="M5 5H15V15H5Z"/></svg>') };

test("Modelos prontos (#10): brindes, esporte e peças funcionais geram prévia 3D", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Modelos prontos");
  await pickModel(page, "Medalha adaptável");
  await page.locator('input[type="file"]').setInputFiles(LOGO);
  const gallery = page.getByRole("group", { name: "Modelo" });
  for (const name of GIFTS_SPORT) {
    await pickModel(page, name);
    await expect(gallery.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
    await expect(page.locator(".viewer .overlay")).toHaveCount(0);
  }
});

test("Modelos prontos: categorias filtram a galeria", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: "Cozinha" }).click();
  const gallery = page.getByRole("group", { name: "Modelo" });
  await expect(gallery.getByRole("button", { name: "Ejetor de brigadeiro" })).toBeVisible();
  await expect(gallery.getByRole("button", { name: "Placa Pix" })).toHaveCount(0);
});
