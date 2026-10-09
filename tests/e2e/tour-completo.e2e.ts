import type { Page } from "@playwright/test";
import { SEED_BASE, SEED_ORDERS } from "../visual/seed";
import { expect, go, openApp, test } from "./tauri";

/**
 * Tour guiado inteiro: percorre TODOS os passos de TODAS as telas com tour, com dados de exemplo, e falha se um alvo não existir
 * ou não estiver visível (o tour pula passos sem alvo e registra em <html data-tour-skipped>). Tela nova com tour entra em TELAS.
 */
const TELAS: Record<string, string> = {
  home: "Início",
  create: "Criar",
  models: "Modelos prontos",
  keychain: "Chaveiros",
  lithophane: "Foto em relevo",
  organizers: "Organizadores",
  calculator: "Calculadora",
  orders: "Pedidos",
  customers: "Clientes",
  products: "Produtos",
  filaments: "Filamentos",
  preferences: "Preferências",
};
/** Passos em que o tour espera a pessoa clicar: o que clicar (o resto do tour continua na tela seguinte). */
const CLICK: Record<string, string> = { lithophane: ".relief-cards button >> nth=0", organizers: ".org-choices button >> nth=0" };

type Step = { text: string; wait?: "click" | "input"; sel?: string; optional?: boolean };
const loadTours = (page: Page) =>
  page.evaluate(async () => {
    const m = await import("/src/help/tours.ts");
    return m.TOURS.map((t) => ({ id: t.id, steps: t.steps.map((s) => ({ text: s.text, wait: s.wait, sel: s.sel, optional: s.optional })) }));
  }) as Promise<{ id: string; steps: Step[] }[]>;

/** O passo que o balão mostra agora (“3 de 5” → 3), ou 0 se o tour já terminou. */
async function shown(page: Page, first: boolean): Promise<number> {
  const pop = page.locator(".tour-pop");
  // o tour começa uns instantes depois de a tela abrir; depois de começar, "sem balão" quer dizer que acabou
  if (first) await expect(pop).toBeVisible({ timeout: 30_000 });
  // entre dois passos o balão some por instantes: o tour só acabou quando <html data-tour-open> some
  await expect.poll(async () => (await pop.isVisible()) || !(await page.evaluate(() => document.documentElement.dataset.tourOpen)), { timeout: 30_000 }).toBe(true);
  if (!(await pop.isVisible())) return 0;
  return Number(/(\d+) de \d+/.exec((await pop.innerText()) ?? "")![1]);
}

async function walk(page: Page, id: string, steps: Step[]) {
  const pop = page.locator(".tour-pop");
  let done = 0; // último passo já mostrado
  for (let guard = 0; guard < steps.length + 2; guard++) {
    const k = await shown(page, guard === 0);
    if (k === 0) break;
    const step = steps[k - 1];
    // os passos que o tour pulou no caminho só podem ser os opcionais (o resto fica registrado em data-tour-skipped)
    for (const skipped of steps.slice(done, k - 1)) expect(skipped.optional, `${id}: o passo “${skipped.text}” foi pulado`).toBe(true);
    done = k;
    await expect(pop.locator("#tour-text")).toHaveText(step.text);
    await expect(pop).toContainText(`${k} de ${steps.length}`);
    const spot = await page.locator(".tour-spot").boundingBox();
    expect(spot, `${id}: passo ${k} sem destaque`).not.toBeNull();
    expect(spot!.width, `${id}: passo ${k} com destaque vazio`).toBeGreaterThan(8);
    const before = step.text;
    if (step.wait === "click") await page.locator(CLICK[id]).click();
    else if (step.wait === "input") await page.keyboard.type("a");
    else await pop.getByRole("button", { name: k === steps.length ? "Concluir" : "Próximo", exact: true }).click();
    await expect.poll(async () => !(await page.evaluate(() => document.documentElement.dataset.tourOpen)) || ((await pop.isVisible()) && (await pop.locator("#tour-text").innerText()) !== before), { timeout: 30_000 }).toBe(true);
  }
  await expect(pop).toHaveCount(0);
  for (const skipped of steps.slice(done)) expect(skipped.optional, `${id}: o passo final “${skipped.text}” não apareceu`).toBe(true);
}

for (const [scheme, width] of [["light", 1280], ["dark", 1280], ["light", 820]] as const)
  test(`tour guiado: todos os passos de todas as telas apontam para algo visível (${scheme}, ${width}px)`, async ({ page, tauri }) => {
    test.setTimeout(15 * 60_000);
    await page.clock.install({ time: new Date("2026-10-09T10:00:00-03:00") }); // o cartão da ocasião (Dia das Crianças) aparece na Início
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width, height: 900 });
    await openApp(page);
    tauri.db.exec(SEED_BASE + SEED_ORDERS);
    await page.evaluate(() => localStorage.setItem("upvision:tours", "[]")); // o harness desliga as dicas; aqui liga
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible({ timeout: 60_000 });

    const tours = await loadTours(page);
    expect(tours.map((t) => t.id).sort(), "toda tela com tour precisa estar em TELAS neste teste").toEqual(Object.keys(TELAS).sort());
    for (const t of tours) {
      if (t.id !== "home") await go(page, TELAS[t.id]);
      await walk(page, t.id, t.steps);
    }
    expect(await page.evaluate(() => document.documentElement.dataset.tourSkipped ?? ""), "passos sem alvo na tela").toBe("");
    // com a janela larga, até os passos opcionais (que dependem de dados ou do tamanho da janela) aparecem
    if (width >= 1000) expect(await page.evaluate(() => document.documentElement.dataset.tourSkippedOptional ?? ""), "passos opcionais que não apareceram").toBe("");
  });
