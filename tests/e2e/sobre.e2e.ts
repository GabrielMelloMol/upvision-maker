import { expect, openApp, test } from "./tauri";

const rel = (v: string, body = "") => ({ tag_name: `v${v}`, name: `v${v}`, draft: false, prerelease: false, body, html_url: `https://x/v${v}`, published_at: "2026-10-01T00:00:00Z" });

test("versão no rodapé abre Sobre; 2 versões atrás com o que está perdendo (#18)", async ({ page, tauri }) => {
  tauri.releases = [rel("0.4.0", "- **Backup automático** todo dia\n- Sobre com a versão"), rel("0.3.1", "- Correções"), rel("0.2.0"), { ...rel("0.9.0"), prerelease: true }];
  tauri.update = { rid: 1, currentVersion: "0.2.0", version: "0.4.0", date: null, body: null, rawJson: {} };
  await openApp(page);
  const version = page.getByRole("button", { name: /Versão 0\.2\.0, atualização disponível/ });
  await expect(version).toContainText("Atualização disponível");
  await version.click();
  const sheet = page.getByRole("dialog", { name: "Sobre o UpVision Maker" });
  await expect(sheet.getByRole("status")).toHaveText("Você está 2 versões atrás (v0.2.0 → v0.4.0)");
  await expect(sheet.getByText("Backup automático todo dia")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Atualizar agora" })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/depois/sobre-1280-light.png" });
});

test("sem internet mostra o aviso e 'Verificar atualizações' refaz a busca", async ({ page, tauri }) => {
  tauri.releases = null;
  await openApp(page);
  await page.getByRole("button", { name: /abrir Sobre/ }).click();
  const sheet = page.getByRole("dialog", { name: "Sobre o UpVision Maker" });
  await expect(sheet.getByRole("status")).toHaveText("Em dia: você tem a versão mais recente."); // updater respondeu (sem versão nova)
  tauri.releases = [rel("0.2.1")];
  await sheet.getByRole("button", { name: "Verificar atualizações" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Você está 1 versão atrás (v0.2.0 → v0.2.1)");
});
