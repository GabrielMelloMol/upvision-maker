import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("cartão de música: placa com player, letra em mais linhas deixa a placa mais alta, ímã e 3MF (#112)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Cartão de música");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Cartão de música", exact: true }).click();
  await idle(page);
  for (const name of ["Placa", "Texto", "Destaque"]) await expect(page.locator(".legend")).toContainText(name);
  const depth = async () => parseFloat(((await hud(page).textContent()) ?? "").split(" × ")[1]);
  await expect.poll(depth, { timeout: 60_000 }).toBeGreaterThan(50);
  const before = await depth();
  await page.getByLabel(/^Letra, linha 3/).fill("e a terceira linha");
  await page.getByLabel(/^Letra, linha 4/).fill("e a quarta");
  await idle(page);
  await expect.poll(depth).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Ímã atrás" }).click();
  await expect(page.getByText(/Encaixe um ímã de 10 mm/)).toBeVisible();
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});

const SAMPLE = readFileSync("tests/fixtures/spotify/scannable-track.svg", "utf8");
const SPOTIFY = "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl?si=abc123";
const SCANNABLES = "https://scannables.scdn.co/**";

async function openMusicCard(page: Page) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Cartão de música");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Cartão de música", exact: true }).click();
  await idle(page);
}
const codeGroup = (page: Page) => page.getByRole("group", { name: "Código", exact: true });
const depth = async (page: Page) => parseFloat(((await hud(page).textContent()) ?? "").split(" × ")[1]);

test("cartão de música: QR code do link de outro serviço, com teste de leitura da vista de cima", async ({ page }) => {
  await openMusicCard(page);
  await expect(codeGroup(page).getByRole("button")).toHaveText(["Spotify", "QR Code", "Nenhum"]);
  await expect(codeGroup(page).getByRole("button", { name: "QR Code" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".legend")).not.toContainText("Código"); // sem link, sem código
  const before = await depth(page);
  await page.getByLabel(/^Link da música/).fill("https://youtu.be/dQw4w9WgXcQ");
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Código");
  await expect.poll(() => depth(page)).toBeGreaterThan(before + 30); // o bloco do código aumenta o cartão
  await expect(codeGroup(page).getByRole("button", { name: "QR Code" })).toHaveAttribute("aria-pressed", "true"); // link de outro serviço: segue no QR
  await page.getByRole("button", { name: "Testar a leitura da vista de cima" }).click();
  await expect(page.getByText(/Leitura ok: a vista de cima do código lê o mesmo link/)).toBeVisible({ timeout: 60_000 });
});

test("cartão de música: link do Spotify seleciona o Spotify, busca o código uma vez e guarda no projeto", async ({ page }) => {
  let calls = 0;
  await page.route(SCANNABLES, async (route) => {
    calls++;
    await route.fulfill({ body: SAMPLE, contentType: "image/svg+xml", headers: { "access-control-allow-origin": "*" } });
  });
  await openMusicCard(page);
  await page.getByLabel(/^Link da música/).fill(SPOTIFY);
  await expect(codeGroup(page).getByRole("button", { name: "Spotify" })).toHaveAttribute("aria-pressed", "true"); // colar um link do Spotify já seleciona o Spotify
  await idle(page);
  await expect(page.getByText(/Falta buscar o código/).first()).toBeVisible();
  await expect(page.getByText(/traz o logo do Spotify: vender peças com marca de terceiros pode violar direitos de marca/)).toBeVisible();
  await page.getByRole("button", { name: "Buscar o código" }).click();
  await expect(page.getByText(/Código guardado neste projeto: não precisa mais de internet/)).toBeVisible();
  expect(calls).toBe(1);
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Código");
  await expect(page.getByText(/Falta buscar o código do Spotify desta música/)).toHaveCount(0);
  // depois de guardado não depende mais da internet: sem rede, mexer no cartão não busca de novo nem perde o código
  await page.unroute(SCANNABLES);
  await page.route(SCANNABLES, (route) => route.abort("internetdisconnected"));
  await page.getByLabel(/^Largura do código/).fill("66");
  await idle(page);
  await expect(codeGroup(page).getByRole("button", { name: "Spotify" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Código guardado neste projeto/)).toBeVisible();
  expect(calls).toBe(1);
  // o logo é opcional
  await page.getByRole("switch", { name: "Incluir o logo do Spotify" }).uncheck();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Código");
});

test("cartão de música: sem internet o Spotify avisa e volta ao QR com o mesmo link", async ({ page }) => {
  await page.route(SCANNABLES, (route) => route.abort("internetdisconnected"));
  await openMusicCard(page);
  await page.getByLabel(/^Link da música/).fill(SPOTIFY);
  await page.getByRole("button", { name: "Buscar o código" }).click();
  await expect(page.getByText(/sem internet.*Voltei para o QR code com o link/)).toBeVisible({ timeout: 20_000 });
  await expect(codeGroup(page).getByRole("button", { name: "QR Code" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel(/^Link da música/)).toHaveValue(SPOTIFY);
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Código"); // o QR do link entrou no cartão
});

test("cartão de música: Spotify não acha a música e responde estranho: mensagens e volta ao QR", async ({ page }) => {
  let n = 0;
  await page.route(SCANNABLES, (route) => (++n === 1 ? route.fulfill({ status: 404, body: "no", headers: { "access-control-allow-origin": "*" } }) : route.fulfill({ body: "<html>mudou</html>", headers: { "access-control-allow-origin": "*" } })));
  await openMusicCard(page);
  await page.getByLabel(/^Link da música/).fill(SPOTIFY);
  await page.getByRole("button", { name: "Buscar o código" }).click();
  await expect(page.getByText(/não achou essa música/)).toBeVisible();
  await codeGroup(page).getByRole("button", { name: "Spotify" }).click();
  await page.getByRole("button", { name: "Buscar o código" }).click();
  await expect(page.getByText(/não é oficial e pode ter mudado/)).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  for (const size of [{ name: "larga", width: 1280, height: 800 }, { name: "estreita", width: 900, height: 600 }]) {
    test.describe(`código da música · ${scheme} · ${size.name}`, () => {
      test.use({ colorScheme: scheme, viewport: { width: size.width, height: size.height }, reducedMotion: "reduce" });

      test("o campo do código não transborda e passa no axe, com contraste", async ({ page }) => {
        await page.route(SCANNABLES, (route) => route.fulfill({ body: SAMPLE, contentType: "image/svg+xml", headers: { "access-control-allow-origin": "*" } }));
        await openMusicCard(page);
        await page.getByLabel(/^Link da música/).fill(SPOTIFY);
        await page.getByRole("button", { name: "Buscar o código" }).click();
        await expect(page.getByText(/Código guardado neste projeto/)).toBeVisible();
        if (process.env.SHOTS_DIR) await page.locator(".controls").screenshot({ path: `${process.env.SHOTS_DIR}/codigo-musica-${scheme}-${size.name}.png` });
        const sideScroll = await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1);
        expect(sideScroll, "a página rola para o lado").toBe(false);
        const cut = await codeGroup(page).evaluate((el) => [...el.querySelectorAll<HTMLElement>("button")].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent));
        expect(cut, "botões do seletor com texto cortado").toEqual([]);
        const r = await new AxeBuilder({ page }).include("main").exclude("canvas").exclude(".viewer").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), "axe").toEqual([]);
      });
    });
  }
}
