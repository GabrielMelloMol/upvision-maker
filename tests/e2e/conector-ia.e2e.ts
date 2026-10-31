import { expect, go, openApp, prefsSection, test } from "./tauri";

// #304: SHOTS=<pasta> guarda o print do cartão.
const SHOTS = process.env.SHOTS;

test("conector de IA: liga em Preferências, mostra o comando com a chave e desliga apagando a chave", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Preferências");
  await prefsSection(page, "Seus dados");
  const card = page.getByRole("region", { name: "IA no app (MCP)" });
  await card.getByRole("switch", { name: /Deixar uma IA/ }).click();
  await expect(card.getByText(/claude mcp add --transport http upvision/)).toBeVisible();
  const token = (tauri.db.prepare("SELECT value FROM secrets WHERE key = 'mcp_token'").get() as { value: string }).value;
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/conector-ia.png` });
  await card.getByRole("switch", { name: /Deixar uma IA/ }).click();
  await expect(card.getByText(/claude mcp add/)).toBeHidden();
  expect(tauri.db.prepare("SELECT value FROM secrets WHERE key = 'mcp_token'").get()).toBeUndefined();
});
