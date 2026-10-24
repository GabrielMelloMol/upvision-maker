import { mkdirSync } from "node:fs";
import { expect, openApp, settleColors, test } from "./tauri";

// Prints da #253: SHOTS_DIR=pasta. Início de quem acabou de instalar e de quem já fez um cálculo, no claro e no escuro.
const DIR = process.env.SHOTS_DIR;
for (const scheme of ["light", "dark"] as const) {
  test(`prints Comece por aqui (${scheme})`, async ({ page, tauri }) => {
    test.skip(!DIR, "só com SHOTS_DIR");
    mkdirSync(DIR!, { recursive: true });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await openApp(page);
    await expect(page.getByRole("region", { name: "Comece por aqui" })).toBeVisible();
    await settleColors(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/instalacao-nova-${scheme}.png` });
    tauri.db.exec(`INSERT INTO calc_history (name, data, at) VALUES ('Chaveiro', '{}', '2026-09-20 10:00:00')`);
    await page.reload();
    // a abertura (splash) aparece de novo depois do reload: esperar o Início carregar
    await expect(page.getByRole("heading", { name: /Bom dia|Boa tarde|Boa noite/, level: 1 })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("#splash")).toHaveCount(0, { timeout: 30_000 }); // a abertura (3,6 s) cobre o Início até sair
    await expect(page.getByRole("list", { name: "Criar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Esta semana" })).toBeVisible(); // o Início terminou de carregar
    await expect(page.getByRole("region", { name: "Comece por aqui" })).toHaveCount(0);
    await settleColors(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/depois-do-1o-calculo-${scheme}.png` });
  });
}
