import AxeBuilder from "@axe-core/playwright";
import { expect, go, openApp, test } from "./tauri";
import { SEED_BASE } from "../visual/seed";
import { MIN_TARGET_PX } from "../visual/checks";

/**
 * Cadastro do Estoque num padrão só (#178): Filamentos, Materiais extras e Impressoras abrem o cadastro numa folha pelo botão do título
 * (e pelo vazio), como Clientes e Produtos. Conferido em claro e escuro, na janela larga e na mais estreita do app (900 px).
 */
const PAGES = [
  { nav: "Filamentos", add: "Adicionar filamento", empty: "Cadastrar filamento", seed: "DELETE FROM filaments" },
  { nav: "Materiais extras", add: "Adicionar material", empty: "Cadastrar material", seed: "DELETE FROM materials" },
  { nav: "Impressoras", add: "Adicionar impressora", empty: "Cadastrar impressora", seed: "DELETE FROM printers" },
] as const;
const SIZES = [
  { name: "larga", width: 1280, height: 800 },
  { name: "estreita", width: 900, height: 600 },
] as const;

for (const scheme of ["light", "dark"] as const) {
  for (const size of SIZES) {
    test.describe(`${scheme} · ${size.name}`, () => {
      test.use({ colorScheme: scheme, viewport: { width: size.width, height: size.height }, reducedMotion: "reduce" });

      for (const p of PAGES) {
        test(`${p.nav}: a folha de cadastro cabe na janela, tem foco, contraste e alvos`, async ({ page, tauri }) => {
          await openApp(page);
          await go(page, p.nav);
          tauri.db.exec(SEED_BASE);
          await go(page, "Início");
          await go(page, p.nav);
          await page.getByRole("button", { name: p.add }).click();
          const sheet = page.getByRole("dialog", { name: p.add });
          await expect(sheet).toBeVisible();
          await page.waitForTimeout(400);
          if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${p.nav.replace(/ /g, "-")}-${scheme}-${size.name}.png` });

          // cabe na janela: sem rolar a página e com o rodapé (botões) à vista
          const box = (await sheet.boundingBox())!;
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(size.height);
          expect(box.x + box.width).toBeLessThanOrEqual(size.width);
          await expect(sheet.getByRole("button", { name: "Adicionar", exact: true })).toBeInViewport();
          const sideScroll = await page.evaluate(() => document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth + 1);
          expect(sideScroll, "a página rola para o lado").toBe(false);

          // o cursor já está no 1º campo, dentro da folha
          await expect.poll(() => sheet.evaluate((d) => d.contains(document.activeElement) && document.activeElement !== d.querySelector("[aria-label=Fechar]"))).toBe(true);

          // axe com contraste, só na folha
          const r = await new AxeBuilder({ page }).include("dialog[open]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
          expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`), "violações do axe").toEqual([]);

          // alvos de toque e foco visível nos primeiros controles
          const small = await sheet.evaluate((d, min) => [...d.querySelectorAll<HTMLElement>("button, select, input:not([type=hidden])")].filter((e) => {
            const r = ((e.closest("label") as HTMLElement | null) ?? e).getBoundingClientRect();
            return r.width && r.height && (r.width < min || r.height < min);
          }).map((e) => e.getAttribute("aria-label") ?? e.textContent?.trim().slice(0, 30) ?? e.tagName), MIN_TARGET_PX);
          expect(small, `alvos menores que ${MIN_TARGET_PX} px`).toEqual([]);
          // o Tab anda pelos controles da folha (com poucos campos, passar do último sai da página: é o diálogo nativo)
          const controls = await sheet.evaluate((d) => d.querySelectorAll("button:not([disabled]), select, input:not([type=hidden]), summary, a[href]").length);
          for (let i = 0; i < Math.min(8, controls - 2); i++) {
            await page.keyboard.press("Tab");
            const state = await page.evaluate(() => {
              const el = document.activeElement as HTMLElement;
              const st = getComputedStyle(el);
              return { inside: !!el.closest("dialog"), shown: (st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0) || (!!st.boxShadow && st.boxShadow !== "none"), name: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20) ?? el.tagName };
            });
            expect(state.inside, "o Tab fica preso na folha").toBe(true);
            expect(state.shown, `foco visível em ${state.name}`).toBe(true);
          }

          // Esc fecha e o foco volta ao botão do título
          await page.keyboard.press("Escape");
          await expect(sheet).toBeHidden();
          await expect(page.getByRole("button", { name: p.add })).toBeFocused();
        });
      }
    });
  }
}

test("lista vazia: nada abre sozinho e o botão do vazio abre a mesma folha (Filamentos, Materiais, Impressoras)", async ({ page, tauri }) => {
  void tauri;
  await openApp(page);
  for (const p of PAGES) {
    await go(page, p.nav);
    await expect(page.getByText("Nada cadastrado ainda.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: p.empty }).click();
    await expect(page.getByRole("dialog", { name: p.add })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
