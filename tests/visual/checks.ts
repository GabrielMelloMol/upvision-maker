import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * Checagens automáticas de cada tela (#142): transbordo, alvos pequenos, foco visível e contraste AA.
 * Cada problema vira uma linha estável ("chaveiros · alvo < 32 px: button "Girar"") para comparar com a lista
 * de problemas já conhecidos: só falha o que for novo.
 */
/** Abaixo disso é falha (WCAG 2.2 AA, 2.5.8). */
export const MIN_TARGET_PX = 24;
/** Meta da #142: entre 24 e 32 px vai para o relatório como aviso, sem falhar (botões sm de 28 px são de propósito). */
export const GOAL_TARGET_PX = 32;
const FOCUS_TABS = 12;

/** Conteúdo cortado (a caixa esconde o que passa dela, sem rolagem nem reticências) e a página rolando para o lado. */
export function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const name = (el: Element) => {
      const text = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
      return `${el.tagName.toLowerCase()}${cls}${text ? ` "${text}"` : ""}`;
    };
    const out: string[] = [];
    const doc = document.scrollingElement!;
    if (doc.scrollWidth > doc.clientWidth + 1) out.push(`a página rola para o lado (${doc.scrollWidth} > ${doc.clientWidth} px)`);
    for (const el of document.querySelectorAll<HTMLElement>("main *, nav *, dialog *")) {
      if (!el.offsetParent || el.clientWidth === 0) continue;
      const st = getComputedStyle(el);
      // só o que a caixa corta de verdade: rolagem, reticências e texto para leitor de tela (1 px) são de propósito
      if (!["hidden", "clip"].includes(st.overflowX) || st.textOverflow === "ellipsis" || el.clientWidth <= 2) continue;
      if (el.closest(".viewer, svg, canvas")) continue; // prévia 3D e desenhos
      if (el.scrollWidth > el.clientWidth + 2) out.push(`cortado: ${name(el)}`);
    }
    return [...new Set(out)].slice(0, 30);
  });
}

/** Botões, abas, seletores e caixas de marcar menores que 32 px (links dentro do texto não contam). */
export function smallTargets(page: Page, min = MIN_TARGET_PX): Promise<string[]> {
  return page.evaluate((min) => {
    const out: string[] = [];
    const sel = "main button, main [role=button], main [role=tab], main select, main input[type=checkbox], main input[type=radio], nav button";
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const target = (el.closest("label") as HTMLElement | null) ?? el; // a legenda da caixa de marcar também é clicável
      const r = target.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
      if (r.width < min || r.height < min) {
        const text = (el.getAttribute("aria-label") ?? el.textContent ?? el.getAttribute("title") ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
        out.push(`alvo < ${min} px: ${el.tagName.toLowerCase()} "${text}" (${Math.round(r.width)}×${Math.round(r.height)})`);
      }
    }
    return [...new Set(out)];
  }, min);
}

/** Tab pelos primeiros controles: cada um precisa mostrar o foco (contorno ou sombra). */
export async function focusVisible(page: Page): Promise<string[]> {
  // clicar no título faz o Tab começar do conteúdo (e não da barra lateral), como para quem usa o teclado
  await page.locator("main h1").first().click();
  const out: string[] = [];
  for (let i = 0; i < FOCUS_TABS; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || !el.closest("main")) return null;
      const st = getComputedStyle(el);
      const shown = (st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0) || (st.boxShadow && st.boxShadow !== "none");
      const text = (el.getAttribute("aria-label") ?? el.textContent ?? (el as HTMLInputElement).name ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
      return shown ? null : `sem foco visível: ${el.tagName.toLowerCase()} "${text}"`;
    });
    if (r) out.push(r);
  }
  return [...new Set(out)];
}

/** Contraste AA (axe-core) no conteúdo e na barra lateral. */
export async function contrast(page: Page): Promise<string[]> {
  const res = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  return res.violations.flatMap((v) => v.nodes.map((n) => `contraste: ${n.target.join(" ")}`)).slice(0, 30);
}
