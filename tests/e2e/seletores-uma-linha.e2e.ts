import { expect, go, openApp, test } from "./tauri";

// Auditoria de UX (M4): "Como vai imprimir" virava uma caixa de 4 linhas e "Quebra-cabeça" (Pixel art) quebrava em 2:
// com flex: 1 todos os botões do seletor ganhavam a mesma largura e o rótulo mais longo quebrava. O texto não pode quebrar.
for (const largura of [1280, 1000])
  for (const tela of ["Chaveiros", "Pixel art", "Medalhas", "Desenho em 3D"])
    test(`seletores de ${tela} em ${largura} px: cada botão fica em uma linha (M4)`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await openApp(page);
      await go(page, tela);
      await expect(page.locator("main h1")).toBeVisible();
      await page.waitForTimeout(2500); // o "Como vai imprimir" aparece com a peça pronta
      const altos = await page.locator(".seg button:visible").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 36).map((e) => `${e.textContent} (${Math.round(e.getBoundingClientRect().height)} px)`));
      expect(altos, "botões de seletor com texto quebrado").toEqual([]);
    });

// Auditoria de UX (B1): "Extrudar em 3D" quebrava em 2 linhas no rodapé de ações de Imagem → SVG.
for (const largura of [1280, 1000])
  test(`ações de Imagem → SVG em ${largura} px: cada botão fica em uma linha (B1)`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 800 });
    await openApp(page);
    await go(page, "Imagem → SVG");
    await expect(page.getByRole("button", { name: "Fazer peça 3D" })).toBeVisible();
    const altos = await page.locator("main .card .grid.two > button").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 40).map((e) => `${e.textContent?.trim()} (${Math.round(e.getBoundingClientRect().height)} px)`));
    expect(altos, "botões de ação com texto quebrado").toEqual([]);
  });
