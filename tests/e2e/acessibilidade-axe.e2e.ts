import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, openApp, test } from "./tauri";
import { SEED_BASE, SEED_ORDERS } from "../visual/seed";

/**
 * Regras estruturais do axe (WCAG 2.2 AA) em todas as telas da navegação, com dados de exemplo (auditoria de UX, M15:
 * um role="img" com botão dentro passou despercebido). O contraste fica com o teste visual (tests/visual), que já o mede.
 */
const ids = (els: Element[]) => els.map((e) => e.getAttribute("data-page") ?? "");

async function pages(page: Page): Promise<{ id: string; section: string; via: "section" | "sub" | "link" }[]> {
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const sections = await nav.locator("button.nav[data-page]:not(.sub)").evaluateAll(ids);
  const out: { id: string; section: string; via: "section" | "sub" | "link" }[] = [];
  for (const section of sections) {
    await nav.locator(`button.nav[data-page="${section}"]:not(.sub)`).click();
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForTimeout(300);
    out.push({ id: section, section, via: "section" });
    for (const id of await nav.locator("button.nav.sub[data-page]").evaluateAll(ids)) out.push({ id, section, via: "sub" });
    for (const id of await page.locator("main a[data-page]").evaluateAll(ids)) out.push({ id, section, via: "link" });
  }
  return out.filter((x, i) => x.id && out.findIndex((y) => y.id === x.id) === i);
}

test("nenhuma tela tem violação estrutural de acessibilidade (axe, sem contraste)", async ({ page, tauri }) => {
  test.setTimeout(10 * 60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  tauri.db.exec(SEED_BASE + SEED_ORDERS);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const found: string[] = [];
  for (const s of await pages(page)) {
    await nav.locator(`button.nav[data-page="${s.section}"]:not(.sub)`).click();
    if (s.via === "sub") await nav.locator(`button.nav.sub[data-page="${s.id}"]`).click();
    if (s.via === "link") await page.locator(`main a[data-page="${s.id}"]`).first().click();
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForTimeout(700);
    const r = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).disableRules(["color-contrast"]).analyze();
    for (const v of r.violations) found.push(`${s.id} · ${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  }
  expect(found, "violações do axe").toEqual([]);
});
