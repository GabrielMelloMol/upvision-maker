import { expect, test } from "./tauri";

test("abertura (#139, #153): completa toda vez, com o bico e as 3 camadas; sai depois que o app monta; tecla pula", async ({ page }) => {
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
  await expect(splash.locator(".brand-mark .layer")).toHaveCount(3);
  await expect(splash.locator(".nozzle .nozzle-glow")).toHaveCount(1); // o bico que deposita as camadas (#150)
  release();
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible({ timeout: 60_000 }); // Vite frio
  await expect(splash).toHaveCount(0, { timeout: 10_000 }); // app montou e a animação terminou: abriu

  // de novo: a completa aparece toda vez (#153); com o app parado, é a tecla que fecha
  await page.unroute("**/src/main.tsx*");
  await page.route("**/src/main.tsx*", (r) => r.fulfill({ body: "", contentType: "text/javascript" }));
  await page.reload({ waitUntil: "commit" });
  await expect(splash).toHaveClass(/full/);
  await page.keyboard.press("Escape");
  await expect(splash).toHaveCount(0, { timeout: 1500 });
});

test("abertura (#153): com o app pronto na hora, a completa fica uns 3 s e abre o app; o clique pula", async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 60_000); // sempre no futuro (o relógio só anda para frente)
  await page.goto("/");
  const splash = page.locator("#splash");
  await expect(splash).toHaveClass(/full/);
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible({ timeout: 60_000 });
  await page.clock.runFor(2500);
  await expect(splash).not.toHaveClass(/out/); // app montado, mas a animação ainda não terminou
  await page.clock.runFor(6000); // 3 s contados de quando a janela apareceu (o IPC do mock roda no relógio real) + o efeito
  await expect(splash).toHaveCount(0);

  await page.reload();
  await expect(splash).toHaveClass(/full/);
  await page.mouse.click(10, 10);
  await expect(splash).toHaveClass(/skip/); // pular: some num fade curto
});

test("abertura (#168): a escolha antiga Desligada não esconde mais; com Reduzir movimento fica uns 3 s parada e entra num fade", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("upvision:splash-mode", "off")); // o que estava salvo no Mac do Gabriel
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 60_000); // sempre no futuro (o relógio só anda para frente)
  await page.goto("/");
  const splash = page.locator("#splash");
  await expect(splash).toHaveClass(/full/);
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible({ timeout: 60_000 });
  await page.clock.runFor(2500);
  await expect(splash).not.toHaveClass(/out/); // reduzir movimento não encurta: continua na tela
  await page.clock.runFor(6000);
  await expect(splash).toHaveCount(0);
});
