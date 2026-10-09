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
  await expect(variants.getByRole("button", { name: "Foto em relevo" })).toBeVisible(); // atalho: litofania em abajur
});

test("onde fica: 'Veja também' liga as ferramentas parecidas e os atalhos levam ao shadowbox e à litofania", async ({ page }) => {
  await openApp(page);
  await go(page, "Organizador de gaveta");
  await page.getByRole("button", { name: /Organizador pela foto \(encaixe/ }).click();
  // o Organizador pela foto virou uma aba dos Organizadores: o link leva à aba certa
  await expect(page.getByRole("tab", { name: "Pela foto das ferramentas" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: /Gridfinity: caixinha/ }).click();
  await expect(page.getByRole("heading", { name: "Modelos prontos" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Caixinha" })).toHaveAttribute("aria-pressed", "true");

  // Shadowbox virou aba da Foto em relevo: o atalho antigo (Veja também, Criar, busca) cai direto nela
  await go(page, "Foto em relevo");
  await page.getByRole("region", { name: "O que você quer fazer?" }).getByRole("button", { name: /^Shadowbox/ }).click();
  await expect(page.getByRole("heading", { name: "Shadowbox (placas empilhadas)", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Modelos prontos" })).toHaveCount(0);
  // e, nos Modelos prontos, o atalho da família leva de volta à ferramenta
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("shadowbox");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Shadowbox/ }).first().click();
  await page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Foto em relevo" }).click();
  await expect(page.getByRole("heading", { name: "Foto em relevo", level: 1 })).toBeVisible();
});

test("onde fica: Presentes, Casa e decoração e Organização e utilidades separam os Modelos prontos", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await go(page, "Modelos prontos");
  const tabs = page.getByRole("group", { name: "Categoria" });
  const families = page.getByRole("group", { name: "Família" });
  await expect(tabs.getByRole("button")).toHaveText(["Chaveiros", "Placas", "Presentes", "Festa e esporte", "Casa e decoração", "Organização", "Cozinha"]);

  await tabs.getByRole("button", { name: "Presentes" }).click();
  await expect(families.getByRole("button")).toHaveText(["Mapa estelar", "Cartão de música", "Lembrancinhas", "Porta-copos", "Marca-página"]);
  await families.getByRole("button", { name: "Lembrancinhas" }).click();
  await expect(page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Cumbuca" })).toBeVisible();

  await tabs.getByRole("button", { name: "Casa e decoração" }).click();
  await expect(families.getByRole("button")).toHaveText(["Moldura", "Luminárias e abajures", "Quadro e desenho", "Vaso", "Brinquedos"]);

  await tabs.getByRole("button", { name: "Organização" }).click();
  await expect(families.getByRole("button")).toHaveText(["Potes e organizadores", "Organizador modular (Gridfinity)", "Suporte de celular e tablet", "Tecla de teclado", "Porta-chave de parede", "Utilitários"]);

  // buscar leva à aba da família do modelo, mesmo vindo de outra categoria
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("tecla");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: /Tecla de teclado/ }).click();
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("");
  await expect(tabs.getByRole("button", { name: "Organização" })).toHaveAttribute("aria-pressed", "true");
});

test("onde fica: os nomes novos das ferramentas e os antigos continuam achando a tela (⌘K e Criar)", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Buscar" });
  for (const [typed, shown] of [["svg", "Imagem em desenho (SVG)"], ["imagem para svg", "Imagem em desenho (SVG)"], ["3mf", "Separar cores de um 3MF"], ["separar 3mf por cor", "Separar cores de um 3MF"], ["thingiverse", "Buscar modelos na internet"], ["extrusão", "Desenho em 3D"], ["decal", "Nome ou logo no seu modelo"]] as const) {
    await palette.getByRole("combobox").fill(typed);
    await expect(palette.getByRole("option", { name: new RegExp(shown.replace(/[()]/g, "\\$&")) }).first()).toBeVisible();
  }
  await palette.getByRole("combobox").fill("separar cores");
  await palette.getByRole("option", { name: /Separar cores de um 3MF/ }).first().click();
  await expect(page.getByRole("heading", { name: "Separar cores de um 3MF", level: 1 })).toBeVisible();
});
