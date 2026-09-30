import { expect, go, openApp, test } from "./tauri";

/** Galeria em famílias (#141): 24 cards, variação com miniatura, atalhos para as ferramentas e busca pelo nome antigo. */
const CATEGORIES = ["Placas", "Chaveiros", "Festa e esporte", "Casa", "Cozinha"];

test("galeria: as 24 famílias aparecem uma vez cada, divididas pelas abas de categoria", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  const seen: string[] = [];
  for (const c of CATEGORIES) {
    await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: c }).click();
    const cards = page.getByRole("group", { name: "Família" }).getByRole("button");
    await expect(cards.first()).toBeVisible();
    seen.push(...(await cards.allTextContents()));
  }
  expect(seen).toHaveLength(24);
  expect(new Set(seen).size).toBe(24);
  expect(seen).toEqual(expect.arrayContaining(["Placa de balcão", "Chaveiro", "Troféu", "Letras e palavras", "Gridfinity", "Cortadores e formas"]));
});

test("busca pelo nome antigo: 'anilha' acha o modelo e abre Chaveiro › Anilha na aba Chaveiros", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("anilha");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Chaveiro anilha" }).click();
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("");
  await expect(page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: "Chaveiros" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Família" }).getByRole("button", { name: "Chaveiro" })).toHaveAttribute("aria-pressed", "true");
  const variations = page.getByRole("group", { name: "Variação" });
  await expect(variations.getByRole("button", { name: "Anilha" })).toHaveAttribute("aria-pressed", "true");
  // os grupos da família e o atalho da ferramenta de nomes em lote
  await expect(variations).toContainText("Com arte");
  await expect(variations).toContainText("Com função");
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
});

test("atalhos das ferramentas: Chaveiro › Nome (em lote) abre Chaveiros; Medalha › Redonda e formatos abre Medalhas", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: "Chaveiros" }).click();
  await page.getByRole("group", { name: "Família" }).getByRole("button", { name: "Chaveiro" }).click();
  await page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Nome (em lote)" }).click();
  await expect(page.getByRole("heading", { name: "Chaveiros", level: 1 })).toBeVisible();

  await go(page, "Modelos prontos");
  await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: "Festa e esporte" }).click();
  await page.getByRole("group", { name: "Família" }).getByRole("button", { name: "Medalha" }).click();
  await page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Redonda e formatos" }).click();
  await expect(page.getByRole("heading", { name: "Medalhas", level: 1 })).toBeVisible();
});
