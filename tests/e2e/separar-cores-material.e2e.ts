import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("separar 3MF que pinta por material: lista os grupos de cor, escolhe uma região clicando na peça e salva (#229)", async ({ page, tauri }) => {
  await page.setViewportSize({ width: 1440, height: 1250 }); // as posições do clique dependem do tamanho da prévia
  await openApp(page);
  await go(page, "Separar as cores de um arquivo");
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/3mf/personagem-colorido-material.3mf");
  const card = page.getByLabel("Cores do arquivo");
  await expect(card).toBeVisible({ timeout: 60_000 });
  // pele, azul, verde e vermelho: os dois tons de pele entram no mesmo grupo pela tolerância
  await expect(card.getByRole("listitem")).toHaveCount(4);
  await expect(page.getByLabel("Cores encontradas").getByRole("listitem")).toHaveCount(4, { timeout: 60_000 });
  await idle(page);

  // vista original: o clique numa cor escolhe a região (e passa a valer a escolha manual)
  await page.getByRole("button", { name: /Original/ }).click();
  const auto = page.getByRole("button", { name: "Voltar ao automático" });
  for (let y = 300; y <= 700 && !(await auto.count()); y += 25)
    for (let x = 150; x <= 650 && !(await auto.count()); x += 25) await page.locator(".viewer").click({ position: { x, y } });
  await expect(auto).toBeVisible();
  await page.getByRole("button", { name: "Resultado", exact: true }).click();
  await idle(page);

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith("personagem-colorido-material-cores.3mf"))).toBe(true);
});
