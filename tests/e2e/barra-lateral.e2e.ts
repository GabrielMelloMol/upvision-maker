import { expect, go, openApp, test } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;

test("barra lateral (#167): só botão e atalho abrem e fecham; divide o espaço com o conteúdo; recolhida mostra a dica do ícone", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await go(page, "Vender");
  const app = page.locator(".app");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const main = page.locator("main");
  const navW = async () => (await nav.boundingBox())!.width;
  const mainX = async () => (await main.boundingBox())!.x;
  // aberta: o conteúdo começa onde a barra termina (lado a lado, nunca por baixo)
  await expect.poll(mainX).toBe(240);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/barra-aberta.png` });

  await page.mouse.move(900, 400);
  await page.keyboard.press("Control+Alt+KeyS");
  await expect(app).toHaveAttribute("data-sidebar", "rail");
  await expect.poll(navW).toBeLessThan(70);
  await expect.poll(mainX).toBe(64); // o conteúdo cresceu junto
  await expect(nav.getByRole("button", { name: "Expandir barra lateral" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Calculadora" })).toBeHidden();
  expect(await nav.locator(".scroll").evaluate((el) => getComputedStyle(el).overflowX)).toBe("hidden");

  // passar o mouse: NÃO abre (#167); só a dica ao lado do ícone
  await nav.getByRole("button", { name: "Estoque" }).hover();
  await expect(page.locator(".rail-tip")).toHaveText("Estoque");
  await page.waitForTimeout(600);
  expect(await navW()).toBeLessThan(70);
  expect(await mainX()).toBe(64);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/barra-recolhida-dica.png` });
  await page.mouse.move(900, 400);
  await expect(page.locator(".rail-tip")).toHaveCount(0);

  // o botão abre: a barra e o conteúdo andam juntos (a coluna da grade anima) e o conteúdo fica ao lado
  expect(await app.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("grid-template-columns");
  await nav.getByRole("button", { name: "Expandir barra lateral" }).click();
  await expect(app).toHaveAttribute("data-sidebar", "full");
  await expect.poll(mainX).toBe(240);
  await expect(nav.getByRole("button", { name: "Calculadora" })).toBeVisible();

  // lembra depois de reabrir
  await nav.getByRole("button", { name: "Recolher barra lateral" }).click();
  await page.reload();
  await expect(app).toHaveAttribute("data-sidebar", "rail");
  await nav.getByRole("button", { name: "Expandir barra lateral" }).click();
  await expect(app).toHaveAttribute("data-sidebar", "full");
});

test("barra lateral (#167): janela estreita começa recolhida, mas o botão abre e o conteúdo encolhe ao lado", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  const app = page.locator(".app");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const main = page.locator("main");
  await page.setViewportSize({ width: 960, height: 700 });
  await expect(app).toHaveAttribute("data-sidebar", "rail");
  await nav.getByRole("button", { name: "Expandir barra lateral" }).click();
  await expect(app).toHaveAttribute("data-sidebar", "full");
  await expect.poll(async () => (await main.boundingBox())!.x).toBe(240);
  expect((await main.boundingBox())!.width).toBe(960 - 240);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/barra-estreita-aberta.png` });
  await page.mouse.move(600, 400); // o botão recolhido não fica sob o mouse (a dica dele é outra)
  await page.keyboard.press("Control+Alt+KeyS");
  await expect(app).toHaveAttribute("data-sidebar", "rail");
  // teclado: o foco num ícone recolhido mostra a dica, sem abrir
  await nav.getByRole("button", { name: "Início" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(".rail-tip")).toHaveText("Criar");
  await expect(app).toHaveAttribute("data-sidebar", "rail");
});
