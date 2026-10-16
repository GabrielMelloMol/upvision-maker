import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("logo em superfície curva: abre o STL de um personagem, clica na cabeça redonda, põe um texto e salva o 3MF (#212)", async ({ page, tauri }) => {
  await page.setViewportSize({ width: 1440, height: 1250 }); // as posições do clique dependem do tamanho da prévia
  await openApp(page);
  await go(page, "Nome ou logo no seu modelo");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "personagem.stl", mimeType: "model/stl", buffer: readFileSync("tests/fixtures/stl/personagem-arvore.stl") });
  await expect(page.locator(".viewer .hud")).toContainText("65.0 × 30.0 × 53.0 mm", { timeout: 60_000 });
  await idle(page);

  // a cabeça do personagem à esquerda é uma esfera: o clique não acerta nenhuma face plana e vira um ponto de superfície curva
  // (procura na prévia, de cima para baixo, o primeiro clique que acerta a curva: não depende do enquadramento da câmera)
  const limpar = page.getByRole("button", { name: "Limpar ponto" });
  for (let y = 300; y <= 560 && !(await limpar.count()); y += 20)
    for (let x = 120; x <= 620 && !(await limpar.count()); x += 25) await page.locator(".viewer").click({ position: { x, y } });
  await expect(page.getByText(/Superfície curva/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Limpar ponto" })).toBeVisible();

  await page.getByRole("button", { name: /Adicionar texto/ }).click();
  await page.getByLabel("Largura").fill("10");
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Desenho 1");
  await expect(page.locator(".decal-gizmo")).toBeVisible();
  // a peça não cresce além do relevo (0,6 mm para fora da cabeça)
  await expect(page.locator(".viewer .hud")).toContainText(/65\.\d × 30\.\d × 53\.\d mm/);

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("personagem-decal.3mf"))).toBe(true);
});
