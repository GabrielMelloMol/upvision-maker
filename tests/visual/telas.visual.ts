import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, go, openApp, test } from "../e2e/tauri";
import { contrast, focusVisible, overflow, smallTargets } from "./checks";
import { SEED_BASE, SEED_ORDERS } from "./seed";

/**
 * Regressão visual automática (#142): todas as telas da barra lateral, preenchidas, em claro e escuro, em 1100 e
 * 1440 px e em 1280 px com escala 125% e 150% (Windows). Cada tela é comparada com a referência aprovada da
 * plataforma (tests/visual/referencia/<plataforma>) e passa pelas checagens; problemas que já existiam ficam em
 * tests/visual/conhecidos/<plataforma>/*.json e só os novos falham. As referências e a lista vêm do CI (visual.yml).
 *
 *   npm run visual                      compara
 *   npm run visual -- --update-snapshots   aprova as telas atuais como referência
 *   VISUAL_CONHECIDOS=1 npm run visual  regrava a lista de problemas conhecidos
 */
const SIZES = [
  { width: 1100, height: 760, scale: 1, schemes: ["light", "dark"] },
  { width: 1440, height: 900, scale: 1, schemes: ["light", "dark"] },
  { width: 1280, height: 720, scale: 1.25, schemes: ["light"] },
  { width: 1280, height: 720, scale: 1.5, schemes: ["light"] },
] as const;
/** Data fixa: o Painel, os pedidos atrasados e os prazos mudam com o dia. */
const TODAY = new Date("2026-09-30T10:00:00-03:00");
/** Por plataforma, como as referências: as fontes do sistema mudam o que transborda. */
const KNOWN_DIR = `tests/visual/conhecidos/${process.platform}`;

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

for (const size of SIZES) {
  for (const scheme of size.schemes) {
    const tag = `${size.width}${size.scale === 1 ? "" : `@${size.scale * 100}`}-${scheme}`;
    test.describe(tag, () => {
      test.use({ deviceScaleFactor: size.scale, viewport: { width: size.width, height: size.height }, colorScheme: scheme, reducedMotion: "reduce" });

      test(`telas ${tag}`, async ({ page, tauri }) => {
        test.setTimeout(15 * 60_000);
        await page.clock.setFixedTime(TODAY);
        await openApp(page);
        await go(page, "Impressoras"); // cria o banco
        tauri.db.exec(SEED_BASE + SEED_ORDERS);
        const nav = page.getByRole("navigation", { name: "Navegação principal" });
        const only = process.env.VISUAL_PAGES?.split(",").map((x) => x.trim()); // ex.: VISUAL_PAGES="Painel,Pedidos"
        const labels = (await nav.locator(".scroll button.nav").allInnerTexts()).map((t) => t.trim()).filter((t) => t && (!only || only.includes(t)));
        const problems: string[] = [];
        // sem referência desta plataforma ainda (antes da 1ª aprovação no CI): só as checagens
        const approving = test.info().config.updateSnapshots === "all";
        const compare = approving || existsSync(`tests/visual/referencia/${process.platform}`);

        for (const label of labels) {
          const id = slug(label);
          await go(page, label);
          await expect(page.locator("main h1").first()).toBeVisible();
          await page.waitForTimeout(600); // listas e miniaturas carregam do banco
          await nav.locator(".scroll").evaluate((el) => el.scrollTo(0, 0)); // a lista rola ao clicar: a foto não depende da ordem das telas
          const t0 = Date.now();
          if (compare) await expect.soft(page, `tela ${label}`).toHaveScreenshot(`${id}-${tag}.png`, { mask: [page.locator(".viewer canvas"), page.locator("[data-visual-mask]")] });
          const t1 = Date.now();
          const found = [...(await overflow(page)), ...(await smallTargets(page))];
          const t2 = Date.now();
          found.push(...(await contrast(page)));
          const t3 = Date.now();
          found.push(...(await focusVisible(page)));
          if (process.env.VISUAL_TEMPO) console.log(`${id}: tela ${t1 - t0} ms · caixas ${t2 - t1} · contraste ${t3 - t2} · foco ${Date.now() - t3}`);
          problems.push(...found.map((f) => `${id} · ${f}`));
        }

        const file = `${KNOWN_DIR}/${tag}.json`;
        if (process.env.VISUAL_CONHECIDOS) {
          mkdirSync(KNOWN_DIR, { recursive: true });
          writeFileSync(file, `${JSON.stringify([...new Set(problems)].sort(), null, 2)}\n`);
          return;
        }
        const unique = [...new Set(problems)];
        if (!existsSync(file)) {
          // ainda sem lista aprovada nesta plataforma: mostra no relatório, sem falhar
          test.info().annotations.push({ type: "problemas (sem lista aprovada)", description: unique.join("\n") });
          return;
        }
        const known = new Set<string>(JSON.parse(readFileSync(file, "utf8")));
        const fresh = unique.filter((p) => !known.has(p));
        test.info().annotations.push({ type: "problemas conhecidos", description: String(known.size) });
        expect(fresh, "problemas novos de transbordo, alvo, foco ou contraste (ou rode com VISUAL_CONHECIDOS=1 se forem aceitos)").toEqual([]);
      });
    });
  }
}
