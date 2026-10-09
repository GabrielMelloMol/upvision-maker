import { expect, go, openApp, test } from "./tauri";

test("onde fica: o ⌘K acha os Modelos prontos pelo nome que a vendedora usa e abre já no modelo", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Buscar" });
  await palette.getByRole("combobox").fill("geladeira");
  await palette.getByRole("option", { name: /Ímã de geladeira/ }).click();
  await expect(page.getByRole("heading", { name: "Modelos prontos" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Ímã geladeira" })).toHaveAttribute("aria-pressed", "true");

  // porta copos sem hífen, e "camiseta" (o modelo se chama Estampa de camisa)
  await page.keyboard.press("Control+k");
  await palette.getByRole("combobox").fill("porta copos");
  await expect(palette.getByRole("option", { name: /Porta-copos/ })).toBeVisible();
  await palette.getByRole("combobox").fill("camiseta");
  await palette.getByRole("option", { name: /Estampa de camisa/ }).click();
  await expect(page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Camisa" })).toHaveAttribute("aria-pressed", "true");
});

test("onde fica: a busca da galeria entende ocasião e sinônimo; abajur e luminária ficam na mesma família", async ({ page }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  const search = page.getByRole("searchbox", { name: "Buscar modelo" });
  await search.fill("Dia das Mães");
  await expect(page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Mapa estelar/ })).toBeVisible();
  await search.fill("abajur");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Abajur de mesa/ }).click();
  const variants = page.getByRole("group", { name: "Variação" });
  await expect(variants.getByRole("button", { name: "Abajur de mesa" })).toHaveAttribute("aria-pressed", "true");
  await expect(variants.getByRole("button", { name: "Luminária" })).toBeVisible();
  await expect(variants.getByRole("button", { name: "Litofania" })).toBeVisible(); // atalho: litofania em abajur
});

test("onde fica: 'Veja também' liga as ferramentas parecidas e os atalhos levam ao shadowbox e à litofania", async ({ page }) => {
  await openApp(page);
  await go(page, "Organizador de gaveta");
  await page.getByRole("button", { name: /Organizador pela foto \(encaixe/ }).click();
  await expect(page.getByRole("heading", { name: "Organizador pela foto" })).toBeVisible();
  await page.getByRole("button", { name: /Gridfinity: caixinha/ }).click();
  await expect(page.getByRole("heading", { name: "Modelos prontos" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Caixinha" })).toHaveAttribute("aria-pressed", "true");

  await go(page, "Litofania e quadro");
  await page.getByRole("button", { name: /Shadowbox \(placas recortadas/ }).click();
  await expect(page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Shadowbox" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Litofania" }).click();
  await expect(page.getByRole("heading", { name: "Litofania e quadro" })).toBeVisible();
});
