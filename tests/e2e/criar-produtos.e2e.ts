import AxeBuilder from "@axe-core/playwright";
import { expect, go, openApp, settleColors, test } from "./tauri";

// #250: Criar com produtos em cartões, abas por categoria, uma galeria só, busca por sinônimo e Início sem a impressora animada.
const cards = (page: import("@playwright/test").Page) => page.locator(".create-products a");

test("Início: sem a impressora animada, com busca e atalhos que abrem direto", async ({ page }) => {
  await openApp(page);
  await expect(page.locator(".printer-panel, .printer-stage")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Criar" }).getByRole("button")).toHaveCount(6);
  await expect(page.getByRole("list", { name: "Vender" }).getByRole("button")).toHaveCount(3);
  const find = page.getByRole("searchbox", { name: "O que você quer criar?" });
  await expect(find).toHaveAttribute("placeholder", /chaveiro com nome, placa Pix, topo de bolo/);
  await find.fill("topo de bolo");
  await find.press("Enter");
  await expect(page.getByRole("heading", { name: "Criar", level: 1 })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "O que você quer criar?" })).toHaveValue("topo de bolo");
  await expect(cards(page).first()).toContainText("Topo de bolo");
});

test("Criar: produtos com foto antes das ferramentas; cada cartão diz o que resolve e quantos tipos tem", async ({ page }) => {
  await openApp(page);
  await go(page, "Criar");
  await expect(cards(page).first()).toBeVisible();
  // a 1ª ferramenta vem depois do último produto
  const order = await page.evaluate(() => {
    const prod = [...document.querySelectorAll(".create-products a")].pop();
    const tool = document.querySelector(".create-tools a");
    return !!prod && !!tool && !!(prod.compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);
  await expect(page.locator(".create-products a").first().locator("img")).toBeVisible(); // a foto (render) vem primeiro
  const keychain = page.locator('.create-products a[data-product="keychain"]');
  await expect(keychain).toContainText("Chaveiro");
  await expect(keychain).toContainText(/Chaveiro com nome, logo, NFC ou academia/);
  await expect(keychain).toContainText("13 tipos");
  await expect(page.locator(".create-tools > li")).toHaveCount(14);
});

test("Criar: nenhuma ferramenta fica só em Tudo; as abas Do seu arquivo e Não achou? têm as suas", async ({ page }) => {
  await openApp(page);
  await go(page, "Criar");
  const tabs = page.getByRole("group", { name: "Categoria" });
  await tabs.getByRole("button", { name: "Do seu arquivo" }).click();
  await expect(page.locator(".create-tools > li")).toHaveCount(11);
  await expect(page.locator('.create-tools a[data-page="bedcut"]')).toContainText("Dividir peça grande");
  await tabs.getByRole("button", { name: "Não achou?" }).click();
  await expect(page.locator(".create-tools a").evaluateAll((els) => els.map((e) => e.getAttribute("data-page")))).resolves.toEqual(["search3d", "ai", "scad"]);
  // as categorias têm só produtos
  await tabs.getByRole("button", { name: "Cozinha" }).click();
  await expect(page.locator(".create-tools")).toHaveCount(0);
  await expect(cards(page).first()).toBeVisible();
});

test("Criar: a busca acha pelo que a pessoa quer vender e o Todos os produtos volta na mesma vista", async ({ page }) => {
  await openApp(page);
  await go(page, "Criar");
  const box = page.getByRole("searchbox", { name: "O que você quer criar?" });
  for (const [q, first] of [["lembrancinha", /Ímã de geladeira|Estampa de camisa|Cumbuca/], ["anilha", /Chaveiro anilha/], ["dividir stl", /Dividir peça grande/], ["molde", /molde|Molde/i], ["caixinha", /Caixinha/], ["nome", /Chaveiros|nome|Nome/]] as const) {
    await box.fill(q);
    await expect(cards(page).first().or(page.locator(".create-tools a").first())).toContainText(first);
  }
  await box.fill("");
  await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: "Cozinha" }).click();
  await cards(page).filter({ hasText: "Cortadores e formas" }).click();
  await page.getByRole("button", { name: "Todos os produtos" }).click();
  await expect(page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: "Cozinha" })).toHaveAttribute("aria-pressed", "true");
});

test("Criar: ocasião e favoritos moram aqui e o filtro 'só 1 cor' fica em Filtros", async ({ page }) => {
  await openApp(page);
  await go(page, "Criar");
  const chips = page.getByRole("group", { name: "Ocasião" });
  await chips.getByRole("button", { name: "Favoritos" }).click();
  await expect(page.getByText("Nenhum favorito ainda")).toBeVisible();
  await chips.getByRole("button", { name: /^Mais \(/ }).click();
  await chips.getByRole("button", { name: "Dia das Mães" }).click();
  await expect(page.getByRole("heading", { name: "Para Dia das Mães" })).toBeVisible();
  await page.getByText(/^Filtros/).click();
  await page.getByRole("switch", { name: /Só 1 cor/ }).click();
  await expect(cards(page).first()).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  test(`Início e Criar sem violação de acessibilidade (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await openApp(page);
    await settleColors(page);
    const audit = async (where: string) => {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
    };
    await audit("Início");
    await go(page, "Criar");
    await expect(page.getByRole("heading", { name: "Criar", level: 1 })).toBeVisible();
    await expect(cards(page).first()).toBeVisible();
    await settleColors(page);
    await audit("Criar");
    await page.getByRole("searchbox", { name: "O que você quer criar?" }).fill("pix");
    await settleColors(page);
    await audit("Criar com busca");
  });
