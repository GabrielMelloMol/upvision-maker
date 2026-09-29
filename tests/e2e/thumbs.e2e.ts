import { expect, go, openApp, test } from "./tauri";

// Gera as miniaturas da galeria de Modelos prontos: `npm run thumbs` (fora disso, pula).
// Grava fora de src/ (o Vite recarregaria a página a cada arquivo novo); o script copia para src/assets/model-thumbs.
const OUT = "test-results/model-thumbs";
const CATEGORIES = ["Chaveiros", "Placas", "Festa e esporte", "Casa", "Cozinha"];
// desenho de exemplo (estrela) para os modelos que pedem um: a miniatura não sai vazia
const STAR = { name: "estrela.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><polygon points="10,0 13,7 20,7 14,12 16,20 10,15 4,20 6,12 0,7 7,7"/></svg>') };

test("miniaturas dos modelos prontos", async ({ page, tauri }) => {
  test.skip(!process.env.THUMBS, "só com THUMBS=1 (npm run thumbs)");
  test.setTimeout(1_800_000);
  void tauri;
  await page.setViewportSize({ width: 1100, height: 760 });
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.addStyleTag({ content: ".viewer .hud, .viewer .legend { visibility: hidden !important; }" });
  const models: { id: string; label: string }[] = [];
  for (const cat of CATEGORIES) {
    await page.getByRole("group", { name: "Categoria" }).getByRole("button", { name: cat }).click();
    models.push(...(await page.locator(".model-gallery button[data-id]").evaluateAll((bs) => bs.map((b) => ({ id: (b as HTMLElement).dataset.id!, label: b.textContent!.trim() })))));
  }
  const skipped: string[] = [];
  for (const m of models) {
    await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(m.label);
    await page.locator(`.model-gallery button[data-id="${m.id}"]`).click();
    // Placa Pix abre sem chave (estado vazio): usa uma de exemplo
    const pixKey = page.getByLabel("Chave Pix");
    if ((await pixKey.count()) && !(await pixKey.inputValue())) {
      await pixKey.fill("loja@exemplo.com");
      await page.getByLabel("Nome de quem recebe").fill("Minha Loja");
      await page.getByLabel("Cidade").fill("Niteroi");
    }
    const upload = page.locator('.controls input[type="file"]');
    if ((await upload.count()) && !(await page.getByText("estrela.svg").count())) await upload.first().setInputFiles(STAR);
    try {
      // pronto = tem medidas na prévia e nenhuma camada de "gerando" por cima
      await expect(page.locator(".viewer .hud")).toHaveCount(1, { timeout: 120_000 });
      await expect(page.locator(".viewer .overlay")).toHaveCount(0, { timeout: 120_000 });
    } catch {
      skipped.push(m.id);
      continue;
    }
    await page.waitForTimeout(600);
    const box = (await page.locator(".viewer").boundingBox())!;
    const h = box.width * 0.75;
    await page.screenshot({ path: `${OUT}/${m.id}.jpg`, type: "jpeg", quality: 62, clip: { x: box.x, y: box.y + (box.height - h) / 2, width: box.width, height: h } });
  }
  console.log(`miniaturas: ${models.length - skipped.length} de ${models.length}${skipped.length ? `; sem miniatura: ${skipped.join(", ")}` : ""}`);
});
