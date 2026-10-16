import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, go, openApp, settleColors, test, toastWith } from "./tauri";

const FILE = resolve("tests/fixtures/logo.jpg");
const OTHER = resolve("tests/fixtures/desenho.jpg");
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

test("proteger arquivo: hash igual ao do sistema, certificado em PDF e .json salvos, conferência certa e errada", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Certificado de autoria");
  await page.locator('input[type="file"]').first().setInputFiles(FILE);
  const want = sha(FILE);
  await expect(page.getByLabel("Hash SHA-256 do arquivo")).toContainText(want.slice(0, 8));
  const shown = (await page.getByLabel("Hash SHA-256 do arquivo").textContent())!.replace(/\s/g, "");
  expect(shown).toBe(want); // o app e o sistema calculam o mesmo SHA-256
  await page.getByLabel(/^Autor ou loja/).fill("Loja da Ana");
  await page.getByRole("button", { name: /Salvar certificado \(PDF\)/ }).click();
  await expect(toastWith(page, "Certificado salvo")).toBeVisible();
  const pdfKey = [...tauri.files.keys()].find((p) => /certificado-.*\.pdf$/.test(p))!;
  expect(pdfKey).toBeTruthy();
  expect(tauri.files.get(pdfKey)!.subarray(0, 5).toString()).toBe("%PDF-");
  await page.getByRole("button", { name: /Salvar dados para conferir depois/ }).click();
  await expect(toastWith(page, "Dados do certificado salvos")).toBeVisible();
  const jsonKey = [...tauri.files.keys()].find((p) => /certificado-.*\.json$/.test(p))!;
  expect(JSON.parse(tauri.files.get(jsonKey)!.toString())).toMatchObject({ sha256: want, author: "Loja da Ana" });

  // conferir: o mesmo arquivo com o hash digitado confere; outro arquivo não confere
  await page.locator('input[type="file"]').nth(1).setInputFiles(FILE);
  await page.getByLabel(/^Hash do certificado/).fill(want.toUpperCase().match(/.{8}/g)!.join(" "));
  await expect(page.getByText("Confere.")).toBeVisible();
  await page.locator('input[type="file"]').nth(1).setInputFiles(OTHER);
  await expect(page.getByText("Não confere.")).toBeVisible();
  // pelo .json salvo
  await page.locator('input[type="file"]').nth(1).setInputFiles(FILE);
  await page.locator('input[type="file"]').nth(2).setInputFiles({ name: "c.json", mimeType: "application/json", buffer: tauri.files.get(jsonKey)! });
  await expect(page.getByText(/Emitido em .* por Loja da Ana/)).toBeVisible();
});

test("proteger arquivo: Dados da empresa preenchem autor e contato", async ({ page, tauri }) => {
  const data = JSON.stringify({ name: "Ana Souza ME", tradeName: "Ana 3D", phone: "(11) 99999-0000", email: "ana@ana3d.com.br", instagram: "ana3d" });
  await openApp(page);
  tauri.db.prepare("INSERT INTO company (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(data);
  await go(page, "Certificado de autoria");
  await expect(page.getByLabel(/^Autor ou loja/)).toHaveValue("Ana 3D");
  await expect(page.getByLabel(/^Contato/)).toHaveValue(/\(11\) 99999-0000 · ana@ana3d\.com\.br/);
  await page.locator('input[type="file"]').first().setInputFiles(FILE);
  await expect(page.getByLabel("Hash SHA-256 do arquivo")).toBeVisible();
  await page.getByRole("button", { name: /Salvar certificado \(PDF\)/ }).click();
  await expect(toastWith(page, "Certificado salvo")).toBeVisible();
});

test("proteger arquivo: acessibilidade (axe), claro e escuro", async ({ page }) => {
  await openApp(page);
  await go(page, "Certificado de autoria");
  await page.locator('input[type="file"]').first().setInputFiles(FILE);
  await expect(page.getByLabel("Hash SHA-256 do arquivo")).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await settleColors(page);
    const r = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(r.violations.map((v) => `${scheme} ${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});
