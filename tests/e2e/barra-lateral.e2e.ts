import { expect, go, openApp, test } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;

test("barra lateral recolhível (#139): atalho, faixa de ícones, expande por cima no hover, lembra e recolhe sozinha", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await go(page, "Vender");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const main = page.locator("main");
  await page.mouse.move(900, 400);
  await page.keyboard.press("Control+Alt+KeyS");
  await expect(page.locator(".app")).toHaveAttribute("data-sidebar", "rail");
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeLessThan(70);
  const x = (await main.boundingBox())!.x;
  if (SHOTS) await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/barra-recolhida.png` });

  // passar o mouse: expande por cima; o conteúdo não se mexe
  await nav.hover();
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeGreaterThan(200);
  expect((await main.boundingBox())!.x).toBe(x);
  await expect(nav.getByRole("button", { name: "Calculadora" })).toBeVisible(); // telas da seção aberta
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/barra-hover.png` });
  await page.mouse.move(900, 400);
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeLessThan(70);

  // lembra depois de reabrir; o botão expande de novo
  await page.reload();
  await expect(page.locator(".app")).toHaveAttribute("data-sidebar", "rail");
  await nav.hover();
  await nav.getByRole("button", { name: "Expandir barra lateral" }).click();
  await expect(page.locator(".app")).toHaveAttribute("data-sidebar", "full");

  // janela estreita: recolhe sozinha e sem botão de alternar
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator(".app")).toHaveAttribute("data-sidebar", "rail");
  await nav.hover();
  await expect(nav.getByRole("button", { name: /barra lateral/ })).toHaveCount(0);
});
