import { expect, openApp, test } from "./tauri";

// #316: SHOTS=<pasta> guarda o print das sugestões.
const SHOTS = process.env.SHOTS;

test("Início: a caixa de busca mostra sugestões enquanto digita e abre a escolhida", async ({ page }) => {
  await openApp(page);
  const box = page.getByRole("combobox", { name: "O que você quer criar?" });
  await box.fill("chav");
  const list = page.locator("#home-suggest");
  await expect(list.getByRole("option").first()).toBeVisible();
  await box.press("ArrowDown");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sugestoes.png` });
  const first = (await list.getByRole("option").first().locator(".t").textContent())!;
  await box.press("Enter");
  await expect(page.locator("#home-suggest")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(/Boa (noite|tarde)|Bom dia/);
  expect(first.length).toBeGreaterThan(0);
});
