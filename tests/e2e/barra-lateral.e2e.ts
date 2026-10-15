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

test("barra lateral: na janela mínima (900 px) as telas da seção aberta ficam num menu ao lado do ícone (mouse e teclado)", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openApp(page);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(page.locator(".app")).toHaveAttribute("data-sidebar", "rail");
  await nav.getByRole("button", { name: "Vender" }).click(); // abre Pedidos e a seção
  await expect(page.getByRole("heading", { name: "Pedidos", level: 1 })).toBeVisible();
  const before = process.env.SHOTS_DIR;
  if (before) await page.screenshot({ path: `${before}/trilho-antes-do-menu.png` });

  // mouse parado no ícone: o menu lista as telas da seção, a aberta marcada
  await page.mouse.move(600, 400);
  await nav.getByRole("button", { name: "Vender" }).hover();
  const menu = page.getByRole("menu", { name: "Vender" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText(["Pedidos", "Orçamentos", "Calculadora", "Clientes", "Produtos"]);
  await expect(menu.getByRole("menuitem", { name: "Pedidos" })).toHaveAttribute("aria-current", "page");
  if (before) await page.screenshot({ path: `${before}/trilho-menu-vender.png` });
  await menu.hover(); // cruzar o espaço até o menu não o fecha
  await page.waitForTimeout(500);
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Clientes" }).click();
  await expect(page.getByRole("heading", { name: "Clientes", level: 1 })).toBeVisible();
  await expect(menu).toBeHidden();

  // teclado: seta para a direita no ícone abre o menu com o foco na primeira tela; seta desce; Esc fecha e devolve o foco ao ícone
  await nav.getByRole("button", { name: "Vender" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(menu.getByRole("menuitem", { name: "Pedidos" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Orçamentos" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Orçamentos", level: 1 })).toBeVisible();
  await nav.getByRole("button", { name: "Vender" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(nav.getByRole("button", { name: "Vender" })).toBeFocused();

  // Ajustes: telas e ações (backup, novidades) no mesmo menu
  await nav.getByRole("button", { name: "Ajustes" }).click();
  await page.mouse.move(600, 400);
  await nav.getByRole("button", { name: "Ajustes" }).hover();
  const settings = page.getByRole("menu", { name: "Ajustes" });
  await expect(settings.getByRole("menuitem", { name: "Preferências" })).toBeVisible();
  await expect(settings.getByRole("menuitem", { name: "Fazer backup" })).toBeVisible();
});

test("janela mínima (900 px, faixa recolhida): a prévia 3D fica ao lado do formulário, sem precisar rolar até ela", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openApp(page);
  await go(page, "Chaveiros");
  const controls = page.locator(".tool-layout > .controls");
  const preview = page.locator(".tool-layout > .preview-col");
  await expect(preview).toBeVisible();
  const [c, v] = [(await controls.boundingBox())!, (await preview.boundingBox())!];
  expect(v.x).toBeGreaterThanOrEqual(c.x + c.width); // lado a lado
  expect(v.y).toBeLessThan(700); // já aparece na primeira tela
  expect(v.width).toBeGreaterThan(300);
});
