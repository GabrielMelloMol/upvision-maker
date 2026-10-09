import type { Locator, Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";
import { rowAction } from "./rowMenu";
import { SEED_BASE, SEED_ORDERS } from "../visual/seed";

/** Menu ⋯ das linhas (#180): o mesmo em Clientes, Custos e Produtos, em claro e escuro, janela larga e estreita. */
const TABLES = [
  { page: "Clientes", subject: /^Ana|^Bia|^Caio|^Dora/ },
  { page: "Custos operacionais", subject: /./ },
  { page: "Produtos", subject: /./ },
];

/** O item do menu é o que se vê no ponto do meio dele: nada (a borda da tabela, outra camada) cobre ou corta o menu. */
async function visibleOnTop(page: Page, item: Locator) {
  const box = (await item.boundingBox())!;
  expect(box.width).toBeGreaterThan(40);
  const ok = await item.evaluate((el, [x, y]) => document.elementFromPoint(x, y) === el, [box.x + box.width / 2, box.y + box.height / 2]);
  expect(ok).toBe(true);
}

for (const view of [
  { name: "larga clara", width: 1280, height: 800, scheme: "light" as const },
  { name: "larga escura", width: 1280, height: 800, scheme: "dark" as const },
  { name: "estreita clara", width: 480, height: 800, scheme: "light" as const },
  { name: "estreita escura", width: 480, height: 800, scheme: "dark" as const },
]) {
  test.describe(view.name, () => {
    test.use({ viewport: { width: view.width, height: view.height }, colorScheme: view.scheme, reducedMotion: "reduce" });

    test("menu ⋯ igual nas tabelas: Excluir por último e em vermelho, nada cortado, teclado e Esc", async ({ page, tauri }) => {
      await openApp(page);
      await go(page, "Impressoras"); // cria o banco
      tauri.db.exec(SEED_BASE + SEED_ORDERS);
      for (const t of TABLES) {
        await go(page, t.page);
        const triggers = page.getByRole("button", { name: /^Ações de / });
        await expect(triggers.first()).toBeVisible();
        const last = triggers.last(); // a última linha é onde o menu mais corre o risco de ser cortado pela tabela
        await last.scrollIntoViewIfNeeded();
        await last.click();
        const items = page.getByRole("menuitem");
        const names = await items.allTextContents();
        expect(names[0], t.page).toBe("Editar");
        expect(names.at(-1), t.page).toBe("Excluir");
        await expect(items.last()).toHaveClass(/danger/);
        // Excluir é vermelho (o do tema), mesmo dentro da célula da tabela, onde a lixeira comum é cinza
        const reds = await items.last().evaluate((el) => {
          const probe = document.createElement("span");
          probe.style.color = "var(--danger)";
          document.body.append(probe);
          const danger = getComputedStyle(probe).color;
          probe.remove();
          return { item: getComputedStyle(el).color, danger };
        });
        expect(reds.item, t.page).toBe(reds.danger);
        for (const i of await items.all()) await visibleOnTop(page, i);
        await expect(items.first()).toBeFocused();
        await page.keyboard.press("ArrowUp"); // dá a volta até o último
        await expect(items.last()).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("menu")).toHaveCount(0);
        await expect(last).toBeFocused();
        // clicar fora fecha sem escolher nada
        await last.click();
        await page.locator("main h1").first().click();
        await expect(page.getByRole("menu")).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${t.page}: sem rolagem lateral`).toBe(true);
      }
    });
  });
}

test("Editar e Excluir pelo menu: abre a ficha e pede confirmação antes de apagar (Cancelar não apaga)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras");
  tauri.db.exec(SEED_BASE + SEED_ORDERS);
  await go(page, "Clientes");
  const row = page.getByRole("row").filter({ has: page.getByRole("button", { name: /^Ações de / }) }).first();
  await rowAction(page, /./, "Editar", row);
  await expect(page.getByRole("dialog", { name: /^Editar / })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  const before = await page.getByRole("row").count();
  tauri.askAnswer = false; // responde "Cancelar" à confirmação
  await rowAction(page, /./, "Excluir", row);
  await expect.poll(() => tauri.calls.filter((c) => c === "plugin:dialog|message").length).toBe(1); // pediu confirmação
  await expect(page.getByRole("row")).toHaveCount(before); // e, cancelado, nada foi apagado
});
