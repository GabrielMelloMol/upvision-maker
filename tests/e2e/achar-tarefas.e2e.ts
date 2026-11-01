import { appendFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, openApp, test } from "./tauri";

/**
 * Achar as coisas (#250): quantos cliques e que busca levam a cada tarefa, partindo do Início. Meta: até 2 cliques ou 1 busca.
 * Cada tarefa tem o caminho pelos cliques (`browse`) e os da busca (a do Início e o ⌘K: digita, abre o 1º resultado), cada um num teste novo (sem rascunho do anterior).
 * ACHAR_OUT=arquivo grava uma linha JSON por tarefa (para a tabela do antes e depois).
 */
const OUT = process.env.ACHAR_OUT;
const nav = (p: Page) => p.getByRole("navigation", { name: "Navegação principal" });
const clicks = (p: Page) => p.evaluate(() => (window as unknown as { __clicks: number }).__clicks);
const zero = (p: Page) => p.evaluate(() => ((window as unknown as { __clicks: number }).__clicks = 0));
const variant = (p: Page, name: string) => p.getByRole("group", { name: "Variação" }).getByRole("button", { name, exact: true });
const model = (p: Page, title: string) => p.getByRole("heading", { name: title, level: 2 });
const h1 = (p: Page, name: string) => expect(p.getByRole("heading", { name, level: 1 })).toBeVisible();
const shortcut = (p: Page, name: string) => p.getByRole("button", { name, exact: true }).click();
const create = (p: Page) => nav(p).getByRole("button", { name: "Criar", exact: true }).click();
const card = (p: Page, title: string) => p.locator(".create-products a, .create-tools a").filter({ has: p.locator("strong").filter({ hasText: new RegExp(`^${title}$`) }) }).first().click();

type Task = { id: string; label: string; query: string; /** cliques que valem navegando (a busca cobre o resto) */ max?: number; browse: (p: Page) => Promise<void>; check: (p: Page) => Promise<void> };
const TASKS: Task[] = [
  { id: "anilha", label: "Chaveiro de academia (anilha)", query: "anilha", max: 3, browse: async (p) => { await create(p); await card(p, "Chaveiro"); await variant(p, "Anilha").click(); }, check: (p) => expect(variant(p, "Anilha")).toHaveAttribute("aria-pressed", "true") },
  { id: "pix", label: "Placa Pix", query: "placa pix", browse: (p) => shortcut(p, "Placa Pix"), check: (p) => expect(variant(p, "Pix")).toHaveAttribute("aria-pressed", "true") },
  { id: "litofania", label: "Litofania (foto que acende)", query: "litofania", browse: (p) => shortcut(p, "Litofania"), check: (p) => h1(p, "Litofania") },
  { id: "dividir", label: "Dividir um STL grande", query: "dividir stl", browse: async (p) => { await create(p); await card(p, "Dividir peça grande"); }, check: (p) => h1(p, "Dividir peça grande") },
  { id: "topo", label: "Topo de bolo", query: "topo de bolo", browse: (p) => shortcut(p, "Topo de bolo"), check: (p) => expect(model(p, "Topo de bolo")).toBeVisible() },
  { id: "nome", label: "Chaveiro com nome", query: "chaveiro com nome", browse: (p) => shortcut(p, "Chaveiro com nome"), check: (p) => h1(p, "Chaveiros") },
  { id: "termo", label: "Caixinha termoformada", query: "caixinha termoformada", browse: async (p) => { await create(p); await card(p, "Caixinha termoformada"); }, check: (p) => h1(p, "Caixinha termoformada") },
  { id: "medalha", label: "Medalha", query: "medalha", browse: (p) => shortcut(p, "Medalha"), check: (p) => h1(p, "Medalhas") },
  { id: "biscoito", label: "Cortador de biscoito", query: "cortador de biscoito", browse: (p) => shortcut(p, "Cortador de biscoito"), check: (p) => h1(p, "Cortador de biscoito") },
  { id: "preco", label: "Calcular preço", query: "calcular preço", browse: (p) => shortcut(p, "Calcular preço"), check: (p) => h1(p, "Calculadora de preço") },
];

const record = (t: Task, path: string, value: string) => OUT && appendFileSync(OUT, `${JSON.stringify({ id: t.id, label: t.label, query: t.query, path, value })}\n`);
async function start(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __clicks: number }).__clicks = 0;
    // só cliques de mouse: o Enter que envia um formulário também dispara um "click", mas sem detail
    document.addEventListener("click", (e) => e.isTrusted && e.detail > 0 && ((window as unknown as { __clicks: number }).__clicks += 1), true);
  });
  await openApp(page);
  await zero(page);
}

for (const t of TASKS) {
  test(`achar: ${t.label}: navegando, em poucos cliques`, async ({ page }) => {
    test.slow();
    await start(page);
    await t.browse(page);
    await t.check(page);
    const n = await clicks(page);
    record(t, "navegando", `${n} cliques`);
    expect(n, `${t.label}: ${n} cliques`).toBeLessThanOrEqual(t.max ?? 2); // o que passa de 2 cliques tem a busca (os outros dois testes)
  });

  // a busca do Início leva à Criar já filtrada; "Calcular preço" não é da Criar e fica com o ⌘K
  if (t.id !== "preco")
    test(`achar: ${t.label}: 1 busca no Início`, async ({ page }) => {
      test.slow();
      await start(page);
      await page.getByRole("combobox", { name: "O que você quer criar?" }).fill(t.query);
      await page.keyboard.press("Enter");
      await page.locator(".create-products a, .create-tools a").first().click();
      await t.check(page);
      record(t, "busca do Início", `1 busca + ${await clicks(page)} clique`);
    });

  test(`achar: ${t.label}: 1 busca no ⌘K`, async ({ page }) => {
    test.slow();
    await start(page);
    await page.keyboard.press("Control+k");
    const box = page.getByRole("dialog", { name: "Buscar" });
    await box.getByRole("combobox").fill(t.query);
    // os modelos entram na lista um instante depois de abrir a busca: espera o 1º resultado parar de mudar
    let last = "";
    await expect.poll(async () => { const now = (await box.getByRole("option").first().innerText()) ?? ""; const same = now === last; last = now; return same; }, { intervals: [400] }).toBe(true);
    await box.getByRole("option").first().click();
    await t.check(page);
    record(t, "⌘K", `1 busca + ${await clicks(page)} clique`);
  });
}
