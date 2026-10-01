import { expect, test } from "./tauri";

test("abertura (#139): impressão completa 1ª vez no dia, some quando o app monta, fade curto depois e tecla pula", async ({ page }) => {
  // o app só carrega quando o teste liberar: a abertura fica na tela para ser conferida
  let release!: () => void;
  const held = new Promise<void>((ok) => (release = ok));
  await page.route("**/src/main.tsx*", async (r) => {
    await held;
    await r.continue();
  });
  await page.goto("/", { waitUntil: "commit" }); // o load espera o main.tsx, que está segurado
  const splash = page.locator("#splash");
  await expect(splash).toHaveClass(/full/);
  await expect(splash.locator(".brand-mark .layer")).toHaveCount(5);
  await expect(splash.locator(".nozzle .nozzle-glow")).toHaveCount(1); // o bico que deposita as camadas (#150)
  release();
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible({ timeout: 60_000 }); // Vite frio
  await expect(splash).toHaveCount(0); // app montou: saiu

  // mesmo dia: só o fade curto; com o app parado, é a tecla que fecha (antes da trava de 4 s)
  await page.unroute("**/src/main.tsx*");
  await page.route("**/src/main.tsx*", (r) => r.fulfill({ body: "", contentType: "text/javascript" }));
  await page.reload({ waitUntil: "commit" });
  await expect(splash).toHaveClass(/short/);
  await page.keyboard.press("Escape");
  await expect(splash).toHaveCount(0, { timeout: 1500 });
});

test("abertura (#150): com o app pronto na hora, a impressão completa fica o tempo mínimo e o clique pula", async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date("2026-10-01T09:00:00"));
  await page.goto("/");
  const splash = page.locator("#splash");
  await expect(splash).toHaveClass(/full/);
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible({ timeout: 60_000 });
  await page.clock.runFor(1000);
  await expect(splash).not.toHaveClass(/out/); // app montado, mas a animação ainda não terminou
  await page.clock.runFor(1500); // 1,4 s + o voo até a barra lateral
  await expect(splash).toHaveCount(0);

  // outra abertura no modo completo (dia seguinte): o clique pula na hora
  await page.clock.pauseAt(new Date("2026-10-02T09:00:00"));
  await page.reload();
  await expect(splash).toHaveClass(/full/);
  await page.mouse.click(10, 10);
  await expect(splash).toHaveClass(/gone/); // pular: some sem o voo
});
