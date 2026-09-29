import { expect, go, openApp, test } from "./tauri";

// o registro de settings só aparece quando o app grava: antes disso, undefined (o poll tenta de novo)
const kwh = (tauri: { db: { prepare: (s: string) => { get: () => unknown } } }) => {
  const row = tauri.db.prepare("SELECT data FROM settings").get() as { data: string } | undefined;
  return row ? JSON.parse(row.data).kwhPrice : undefined;
};

test("sem a conta de luz: média do estado no primeiro uso e nas Preferências, com fonte (#39)", async ({ page, tauri }) => {
  await openApp(page, { keepOnboarding: true });
  const welcome = page.getByRole("dialog", { name: "Boas-vindas ao UpVision Maker" });
  await welcome.getByLabel(/Sem a conta agora/).selectOption("SP");
  await expect(welcome.getByLabel("Preço do kWh")).toHaveValue("1,00");
  await expect(welcome.getByText(/Estimativa da Enel SP com ICMS \(18 %\)/)).toBeVisible();
  await expect(welcome.getByText(/ANEEL/)).toBeVisible();
  if (process.env.SHOTS_DIR) await welcome.screenshot({ path: `${process.env.SHOTS_DIR}/kwh-estado.png` });
  await welcome.getByRole("button", { name: "Continuar" }).click();
  await expect.poll(() => kwh(tauri)).toBe(1);
  await welcome.getByRole("button", { name: "Fechar" }).click();

  await go(page, "Preferências");
  await page.getByLabel(/Sem a conta agora/).selectOption("PR");
  await expect(page.getByLabel("Preço do kWh")).toHaveValue("0,98");
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await expect.poll(() => kwh(tauri)).toBe(0.98);
});
