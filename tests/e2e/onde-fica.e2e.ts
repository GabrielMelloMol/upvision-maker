import { expect, go, openApp, pickModel, test } from "./tauri";

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

test("onde fica: a busca da Criar entende ocasião e sinônimo; abajur e luminária ficam na mesma família", async ({ page }) => {
  await openApp(page);
  await go(page, "Criar");
  const search = page.getByRole("searchbox", { name: "O que você quer criar?" });
  await search.fill("Dia das Mães");
  await expect(page.locator(".create-products a").filter({ hasText: /Mapa estelar/ }).first()).toBeVisible();
  await pickModel(page, "abajur", /Abajur de mesa/);
  const variants = page.getByRole("group", { name: "Variação" });
  await expect(variants.getByRole("button", { name: "Abajur de mesa" })).toHaveAttribute("aria-pressed", "true");
  await expect(variants.getByRole("button", { name: "Luminária" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Todos os produtos" })).toBeVisible(); // volta para a Criar
});

test("onde fica: os atalhos das famílias levam à aba certa de Organizadores e ao shadowbox, e a Litofania e os Organizadores têm tudo numa tela", async ({ page }) => {
  await openApp(page);
  // Gridfinity (Modelos prontos) → atalho "Pela foto" abre Organizadores já na aba das ferramentas
  await pickModel(page, "gridfinity", /Gridfinity: caixinha/);
  await page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Pela foto" }).click();
  await expect(page.getByRole("heading", { name: "Organizadores", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pela foto das ferramentas" })).toHaveAttribute("aria-selected", "true");

  // o nome antigo ainda leva à aba certa (ids antigos redirecionam)
  await go(page, "Organizador de gaveta");
  await expect(page.getByRole("tab", { name: "Pela medida da gaveta" })).toHaveAttribute("aria-selected", "true");

  // Litofania: o Shadowbox virou aba da ferramenta; pelo cartão do modelo na Criar, abre lá
  await pickModel(page, "shadowbox", /Shadowbox/);
  await expect(page.getByRole("heading", { name: "Litofania", level: 1 })).toBeVisible();
});

test("onde fica: Presentes, Casa e decoração e Organização e utilidades separam os produtos da Criar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await go(page, "Criar");
  const tabs = page.getByRole("group", { name: "Categoria" });
  const cards = page.locator(".create-products a strong");
  await expect(tabs.getByRole("button")).toHaveText(["Tudo", "Chaveiros", "Placas", "Presentes e lembrancinhas", "Festa e esporte", "Casa e decoração", "Organização e utilidades", "Cozinha", "Do seu arquivo", "Não achou?"]);

  await tabs.getByRole("button", { name: "Presentes e lembrancinhas" }).click();
  await expect(cards).toHaveText(["Mapa estelar", "Cartão de música", "Lembrancinhas", "Kits de montar", "Porta-copos", "Marca-página", "Caixinha termoformada", "Pote, cesto e pulseira termoformados", "Pixel art e mosaico"]);
  await page.locator(".create-products a", { hasText: "Lembrancinhas" }).click();
  await expect(page.getByRole("group", { name: "Variação" }).getByRole("button", { name: "Cumbuca" })).toBeVisible();

  await go(page, "Criar");
  await tabs.getByRole("button", { name: "Casa e decoração" }).click();
  await expect(cards).toHaveText(["Moldura", "Luminárias e abajures", "Quadro e desenho", "Vaso", "Brinquedos", "Suporte de livro", "Litofania (foto que acende)"]);

  await tabs.getByRole("button", { name: "Organização e utilidades" }).click();
  await expect(cards).toHaveText(["Painel perfurado", "Potes e organizadores", "Caixinhas modulares para gaveta", "Suporte de celular e tablet", "Tecla de teclado", "Porta-chave de parede", "Utilitários", "Peças mecânicas", "Gabaritos de oficina"]);

  // "← Todos os produtos" volta para a mesma aba
  await page.locator(".create-products a", { hasText: "Tecla de teclado" }).click();
  await page.getByRole("button", { name: "Todos os produtos" }).click();
  await expect(tabs.getByRole("button", { name: "Organização e utilidades" })).toHaveAttribute("aria-pressed", "true");
});

test("onde fica: os nomes novos das ferramentas e os antigos continuam achando a tela (⌘K e Criar)", async ({ page }) => {
  await openApp(page);
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Buscar" });
  for (const [typed, shown] of [["svg", "Imagem em vetor"], ["imagem para svg", "Imagem em vetor"], ["3mf", "Separar as cores de um arquivo"], ["separar 3mf por cor", "Separar as cores de um arquivo"], ["thingiverse", "Buscar modelos na internet"], ["extrusão", "Imagem em relevo 3D"], ["decal", "Nome ou logo na peça"]] as const) {
    await palette.getByRole("combobox").fill(typed);
    await expect(palette.getByRole("option", { name: new RegExp(shown.replace(/[()]/g, "\\$&")) }).first()).toBeVisible();
  }
  await palette.getByRole("combobox").fill("separar cores");
  await palette.getByRole("option", { name: /Separar as cores de um arquivo/ }).first().click();
  await expect(page.getByRole("heading", { name: "Separar as cores de um arquivo", level: 1 })).toBeVisible();
});
