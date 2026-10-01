import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

/** Meus projetos (#161): o que foi salvo nas ferramentas aparece na biblioteca e reabre do jeito que estava. */
test("chaveiro salvo aparece em Meus projetos (e no Início) e reabre com o texto; tags e favorito", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Chaveiros");
  await page.getByLabel("Texto", { exact: true }).fill("Júlia");
  await idle(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  // o projeto entra na biblioteca depois da miniatura (render à parte, #149)
  await expect.poll(() => (tauri.db.prepare("SELECT COUNT(*) AS n FROM tool_projects").get() as { n: number }).n).toBe(1);

  await go(page, "Início");
  const recent = page.getByRole("region", { name: "Meus projetos" });
  await expect(recent.getByRole("button", { name: /Júlia · Chaveiros/ })).toBeVisible();
  await recent.getByRole("button", { name: "Ver todos" }).click();

  await expect(page.getByRole("heading", { name: "Meus projetos", level: 1 })).toBeVisible();
  const grid = page.getByRole("list", { name: "Projetos" });
  await grid.getByRole("button", { name: /Ações de chaveiro-Júlia/i }).click();
  await page.getByRole("menuitem", { name: "Renomear e tags…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Tags/).fill("escola");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(toastWith(page, "Projeto salvo.")).toBeVisible();
  await grid.getByRole("button", { name: /^Favorito:/ }).first().click();
  await page.getByRole("switch", { name: "Só favoritos" }).click();
  await expect(grid.getByRole("button", { name: /^Abrir chaveiro-Júlia/i })).toBeVisible();

  await grid.getByRole("button", { name: /^Abrir chaveiro-Júlia/i }).click();
  await expect(page.getByRole("heading", { name: "Chaveiros", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Texto", { exact: true })).toHaveValue("Júlia");
});
