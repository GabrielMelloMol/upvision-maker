import AxeBuilder from "@axe-core/playwright";
import { expect, go, openApp, openProduct, pickModel, settleColors, test } from "./tauri";

/** Criar em famílias (#141, #250): um cartão por família, variação com miniatura, atalhos para as ferramentas e busca pelo nome antigo. */
const CATEGORIES = ["Chaveiros", "Placas", "Presentes e lembrancinhas", "Festa e esporte", "Casa e decoração", "Organização e utilidades", "Cozinha"];

test("Criar: as famílias aparecem uma vez cada, divididas pelas abas de categoria", async ({ page }) => {
  await openApp(page);
  await go(page, "Criar");
  const seen: string[] = [];
  for (const c of CATEGORIES) {
    await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: c, exact: true }).click();
    const cards = page.locator(".create-products a strong");
    await expect(cards.first()).toBeVisible();
    seen.push(...(await cards.allTextContents()));
  }
  expect(seen.length).toBeGreaterThanOrEqual(24); // modelo novo vira família nova: o que importa é nenhuma repetida nem fora de aba
  expect(new Set(seen).size).toBe(seen.length);
  expect(seen).toEqual(expect.arrayContaining(["Placa de balcão", "Chaveiro", "Troféu", "Letras e palavras", "Caixinhas modulares para gaveta", "Cortadores e formas"]));
});

test("busca pelo nome antigo: 'anilha' acha o modelo e abre Chaveiro › Anilha", async ({ page }) => {
  await openApp(page);
  await pickModel(page, "anilha", "Chaveiro anilha");
  const variations = page.getByRole("group", { name: "Variação" });
  await expect(variations.getByRole("button", { name: "Anilha" })).toHaveAttribute("aria-pressed", "true");
  // os grupos da família e o atalho da ferramenta de nomes em lote
  await expect(variations).toContainText("Com arte");
  await expect(variations).toContainText("Com função");
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
});

test("atalhos das ferramentas: Chaveiro › Nome em lote abre Chaveiros; Medalha › Redonda abre Medalhas", async ({ page }) => {
  await openApp(page);
  await go(page, "Criar");
  await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: "Chaveiros", exact: true }).click();
  await openProduct(page, "Chaveiro");
  await page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Nome em lote" }).click();
  await expect(page.getByRole("heading", { name: "Chaveiros", level: 1 })).toBeVisible();

  await go(page, "Criar");
  await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: "Festa e esporte" }).click();
  await openProduct(page, "Medalha"); // a família tem 1 modelo: o cartão já abre a ferramenta Redonda
  await expect(page.getByRole("heading", { name: "Medalhas", level: 1 })).toBeVisible();
});

/** Legendas das variações (#181): uma linha só, inteiras (sem reticências), com contraste AA, em claro e escuro, janela larga e estreita. */
for (const scheme of ["light", "dark"] as const)
  for (const width of [1280, 720] as const)
    test(`legendas das variações numa linha só e legíveis (${scheme}, ${width}px)`, async ({ page }) => {
      test.setTimeout(10 * 60_000);
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height: 900 });
      await openApp(page);
      await go(page, "Criar");
      let checked = 0;
      for (const c of CATEGORIES) {
        if (!(await page.getByRole("group", { name: "Categoria" }).isVisible())) await go(page, "Criar");
        await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: c, exact: true }).click();
        const cards = page.locator(".create-products a");
        const names = await cards.locator("strong").allTextContents();
        const variantsOf = await cards.evaluateAll((els) => els.map((e) => (e.getAttribute("data-variants") ?? "").split(",").filter(Boolean).length));
        for (let i = 0; i < names.length; i++) {
          if (variantsOf[i] < 2) continue; // família de uma variação só (ou ferramenta) não tem seletor
          if (!(await cards.nth(i).isVisible())) await go(page, "Criar"); // a Criar volta na mesma aba
          await cards.nth(i).click();
          await page.locator("[data-model]").first().waitFor();
          const picker = page.getByRole("group", { name: "Variação" });
          if (!(await picker.count())) continue; // família de uma variação só não tem seletor
          const bad = await picker.locator(".model-variant-label").evaluateAll((els) =>
            els
              .map((el) => {
                const e = el as HTMLElement;
                const line = parseFloat(getComputedStyle(e).lineHeight) || 16;
                const oneLine = e.getBoundingClientRect().height <= line * 1.3;
                const whole = e.scrollWidth <= e.clientWidth + 1;
                return oneLine && whole ? "" : `${e.textContent}: ${oneLine ? "cortada" : "quebra em várias linhas"}`;
              })
              .filter(Boolean),
          );
          expect(bad, `${c} › ${names[i]}`).toEqual([]);
          await settleColors(page); // a tela acabou de abrir: o axe mede a cor do momento, não a da transição
          const axe = await new AxeBuilder({ page }).include(".model-variants").withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
          expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`), `${c} › ${i}`).toEqual([]);
          checked++;
        }
      }
      expect(checked).toBeGreaterThanOrEqual(15);
    });
