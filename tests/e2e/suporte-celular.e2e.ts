import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("suporte de celular: ângulo, espessura do aparelho, tablet e nome em relevo (#110)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("celular");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Suporte de celular e tablet", exact: true }).click();
  await idle(page);
  // largura 80, altura do apoio 90 + base 5
  await expect(hud(page)).toContainText("80.0 ×", { timeout: 60_000 });
  await expect(hud(page)).toContainText("× 95.0 mm");
  await expect(page.getByRole("status").filter({ hasText: /de pé na base/ })).toBeVisible();

  // inclinar menos deixa o suporte mais comprido (o apoio recua mais) e mostra o aviso de ângulo baixo
  const depth = async () => Number(((await hud(page).textContent()) ?? "").match(/× ([\d.]+) ×/)?.[1]);
  const before = await depth();
  await page.getByLabel(/^Inclinação/).fill("45");
  await idle(page);
  expect(await depth()).toBeGreaterThan(before + 20);
  await expect(page.getByText(/Ângulo baixo/)).toBeVisible();

  // tablet grosso: o lábio sobe sozinho e o app avisa
  await page.getByLabel(/^Espessura do aparelho/).fill("18");
  await idle(page);
  await expect(page.getByText(/Tablet ou aparelho grosso/)).toBeVisible();
  await expect(page.getByText(/Lábio aumentado/)).toBeVisible();

  // nome em relevo na frente: parte à parte
  await page.getByLabel(/^Nome \(na frente\)/).fill("Ana");
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Texto");

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});
