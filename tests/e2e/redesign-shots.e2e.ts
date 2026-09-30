import { SEED_BASE, SEED_ORDERS } from "../visual/seed";
import { expect, go, openApp, test } from "./tauri";

// Redesign (#139): as 4 telas da Fase 1 nos dois temas. SHOTS_REDESIGN=antes|depois → docs/design/<fase>/
const PHASE = process.env.SHOTS_REDESIGN;
test.skip(!PHASE, "só roda com SHOTS_REDESIGN=antes|depois");

for (const scheme of ["light", "dark"] as const)
  test(`redesign ${scheme}`, async ({ page, tauri }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await go(page, PHASE === "antes" ? "Impressoras" : "Estoque"); // cria o banco
    tauri.db.exec(SEED_BASE + SEED_ORDERS);
    tauri.db.exec(`INSERT INTO tool_state (id, data, updatedAt) VALUES ('keychain', '{"text":"Ana"}', '2026-09-29T20:00:00Z')`);
    const shot = async (name: string) => {
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.mouse.move(1279, 799); // sem hover de sobra na foto
      await page.waitForTimeout(600);
      await page.screenshot({ path: `docs/design/${PHASE}/${name}-${scheme}.png` });
    };
    await go(page, "Início");
    const start = page.getByRole("button", { name: "Fechar Comece por aqui" }); // retrato de quem já usa o app
    if (await start.count()) await start.click();
    await shot("inicio");
    if (PHASE === "antes") await go(page, "Modelos prontos");
    else await go(page, "Criar");
    await shot("criar");
    if (PHASE === "antes") await go(page, "Chaveiros");
    else await page.getByRole("link", { name: /^Chaveiros/ }).click();
    await page.waitForTimeout(2500);
    await shot("ferramenta");
    await go(page, "Calculadora");
    await shot("calculadora");
  });
