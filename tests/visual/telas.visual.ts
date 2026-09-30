import type { Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, go, openApp, test } from "../e2e/tauri";
import { contrast, focusVisible, GOAL_TARGET_PX, MIN_TARGET_PX, overflow, smallTargets } from "./checks";
import { SEED_BASE, SEED_ORDERS } from "./seed";

/**
 * Regressão visual automática (#142): todas as telas (seções, sub-telas e ferramentas da galeria Criar), preenchidas, em claro e escuro, em 1100 e
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

type Screen = { id: string; section: string; via: "section" | "sub" | "link" | "model" };
const ids = (els: Element[]) => els.map((e) => e.getAttribute("data-page") ?? "");

/**
 * Todas as telas pela navegação do redesign (#139): cada seção da barra (button.nav[data-page]), as telas dela
 * (button.nav.sub[data-page]) e as ferramentas da galeria Criar (main a[data-page]). Tela nova entra sozinha.
 */
async function screens(page: Page): Promise<Screen[]> {
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const sections = await nav.locator("button.nav[data-page]:not(.sub)").evaluateAll(ids);
  const out: Screen[] = [];
  for (const section of sections) {
    await nav.locator(`button.nav[data-page="${section}"]:not(.sub)`).click();
    await expect(page.locator("main h1").first()).toBeVisible(); // a tela carrega sob demanda: espera antes de ler os links
    await page.waitForTimeout(300);
    out.push({ id: section, section, via: "section" });
    for (const id of await nav.locator("button.nav.sub[data-page]").evaluateAll(ids)) out.push({ id, section, via: "sub" });
    for (const id of await page.locator("main a[data-page]").evaluateAll(ids)) out.push({ id, section, via: "link" });
    // Modelos prontos abre pelos modelos da galeria (#models/<id>), não por data-page
    if (await page.locator('main a[href^="#models/"]').count()) out.push({ id: "models", section, via: "model" });
  }
  return out.filter((x, i) => x.id && out.findIndex((y) => y.id === x.id) === i);
}

async function open(page: Page, s: Screen) {
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.locator(`button.nav[data-page="${s.section}"]:not(.sub)`).click();
  if (s.via === "sub") await nav.locator(`button.nav.sub[data-page="${s.id}"]`).click();
  if (s.via === "link") await page.locator(`main a[data-page="${s.id}"]`).click();
  if (s.via === "model") await page.locator('main a[href^="#models/"]').first().click();
}

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
        const only = process.env.VISUAL_PAGES?.split(",").map((x) => x.trim()); // ids das telas, ex.: VISUAL_PAGES="dashboard,orders"
        const list = (await screens(page)).filter((x) => !only || only.includes(x.id));
        const problems: string[] = [];
        const goal: string[] = []; // alvos entre 24 e 32 px: aviso no relatório
        // sem referência desta plataforma ainda (antes da 1ª aprovação no CI): só as checagens
        const approving = ["all", "changed"].includes(test.info().config.updateSnapshots); // "--update-snapshots" sozinho = "changed"
        const compare = approving || existsSync(`tests/visual/referencia/${process.platform}`);

        for (const screen of list) {
          const { id } = screen;
          await open(page, screen);
          await expect(page.locator("main h1").first()).toBeVisible();
          await page.waitForTimeout(600); // listas e miniaturas carregam do banco
          // listas roladas ao clicar: a foto não depende da ordem das telas
          await nav.evaluate((n) => n.querySelectorAll("*").forEach((el) => el.scrollTop && el.scrollTo(0, 0)));
          const t0 = Date.now();
          if (compare) await expect.soft(page, `tela ${id}`).toHaveScreenshot(`${id}-${tag}.png`, { mask: [page.locator(".viewer canvas"), page.locator("[data-visual-mask]")] });
          const t1 = Date.now();
          const found = [...(await overflow(page)), ...(await smallTargets(page, MIN_TARGET_PX))];
          const below = await smallTargets(page, GOAL_TARGET_PX);
          goal.push(...below.filter((b) => !found.some((f) => f.endsWith(b.split(": ").slice(1).join(": ")))).map((b) => `${id} · ${b}`));
          const t2 = Date.now();
          found.push(...(await contrast(page)));
          const t3 = Date.now();
          found.push(...(await focusVisible(page)));
          if (process.env.VISUAL_TEMPO) console.log(`${id}: tela ${t1 - t0} ms · caixas ${t2 - t1} · contraste ${t3 - t2} · foco ${Date.now() - t3}`);
          problems.push(...found.map((f) => `${id} · ${f}`));
        }

        if (goal.length) test.info().annotations.push({ type: `alvos entre ${MIN_TARGET_PX} e ${GOAL_TARGET_PX} px (aviso)`, description: goal.join("\n") });
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
