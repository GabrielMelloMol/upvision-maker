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
  await expect.poll(async () => (await main.boundingBox())!.x).toBe(64); // a coluna terminou de animar (#156)
  // recolhida (#156): o botão de expandir fica à vista, sem subitens nem barra de rolagem de lado
  await expect(nav.getByRole("button", { name: "Expandir barra lateral" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Calculadora" })).toBeHidden();
  expect(await nav.locator(".scroll").evaluate((el) => getComputedStyle(el).overflowX)).toBe("hidden"); // sem a "barrinha" de rolagem de lado
  const x = (await main.boundingBox())!.x;
  if (SHOTS) await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/barra-recolhida.png` });

  // passar o mouse: abre um painel por cima com a largura cheia; o conteúdo não se mexe
  await nav.hover({ position: { x: 30, y: 300 } });
  await expect.poll(async () => (await nav.boundingBox())!.width).toBe(240);
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

test("barra lateral (#156): recolher pelo botão não reabre por baixo do mouse, anima a largura e o teclado ainda abre", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  // a coluna e a largura andam juntas (sem salto)
  expect(await page.locator(".app").evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("grid-template-columns");
  await nav.getByRole("button", { name: "Recolher barra lateral" }).click(); // o mouse continua em cima da barra
  await expect(page.locator(".app")).toHaveAttribute("data-sidebar", "rail");
  await page.waitForTimeout(900);
  expect((await nav.boundingBox())!.width).toBeLessThan(70); // não abriu por cima sozinha
  // saiu e voltou: aí sim abre por cima
  await page.mouse.move(900, 400);
  await nav.hover();
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeGreaterThan(200);
  await page.mouse.move(900, 400);
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeLessThan(70);
  // teclado: Tab até a barra abre por cima
  await page.locator("main").click({ position: { x: 600, y: 300 } });
  await nav.getByRole("button", { name: "Início" }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeGreaterThan(200);
});
