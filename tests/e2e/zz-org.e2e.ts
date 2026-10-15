import { expect, go, openApp, test } from "./tauri";
const DIR = process.env.SHOTS_DIR!;
test("org", async ({ page }) => {
  test.setTimeout(400_000);
  page.on("pageerror", (e) => console.log("PAGEERR", e.message.slice(0, 300)));
  page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text().slice(0, 200)));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Caixa organizadora");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Caixa organizadora/ }).first().click();
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/org-pagina-fechada.png`, fullPage: true });
  await page.getByRole("button", { name: "Linhas e agulhas" }).click();
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 120_000 });
  await page.waitForTimeout(1200);
  for (const [name, h] of [["divisorias", "Divisórias"], ["paredes", "Paredes"], ["tampa", "Tampa"], ["nome", "Nome e cores"]] as const) {
    await page.getByRole("heading", { name: h, exact: true }).scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/org-sec-${name}.png` });
  }
  await page.getByText("Como usar").first().scrollIntoViewIfNeeded();
  await page.getByText("Como usar").first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/org-ajuda.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/org-ajuda-escuro.png` });
  await page.emulateMedia({ colorScheme: "light" });
  for (const v of ["Compartimentos", "Tampa aberta", "Fechada", "Peças na mesa"]) {
    await page.getByRole("group", { name: "Vista da prévia" }).getByRole("button", { name: v, exact: true }).click();
    await page.waitForTimeout(1200);
    await page.locator(".viewer").first().screenshot({ path: `${DIR}/org-vista-${v.replace(/ /g, "-")}.png` });
  }
});
