import { writeFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

// Imagens da ajuda (#84) tiradas do próprio app: `npm run help-shots` → src/assets/help/<nome>.webp
test.skip(!process.env.HELP_SHOTS, "só roda com HELP_SHOTS=1 (npm run help-shots)");
test.use({ deviceScaleFactor: 2 });

/** Recorta o elemento e grava em WebP (o Chromium converte: nada de dependência nova). */
async function shot(page: Page, el: Locator, name: string, maxWidth = 1000) {
  const png = (await el.screenshot()).toString("base64");
  const dataUrl = await page.evaluate(
    async ([b64, max]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const k = Math.min(1, max / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/webp", 0.86);
    },
    [png, maxWidth] as const,
  );
  writeFileSync(`src/assets/help/${name}.webp`, Buffer.from(dataUrl.split(",")[1], "base64"));
}

async function drag(page: Page, cols: number, rows: number, from: [number, number], to: [number, number]) {
  const b = (await page.locator("svg.drawer-editor").boundingBox())!;
  const at = ([c, r]: [number, number]) => [b.x + (c + 0.5) * (b.width / cols), b.y + b.height - (r + 0.5) * (b.height / rows)] as const;
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps: 4 });
  await page.mouse.up();
}

test("ajuda do organizador de gaveta: como medir (gaveta 3D com a cota acesa), grade com emendas e gaveta montada", async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1640, height: 640 }); // prévia larga e baixa: a gaveta ocupa a foto
  await openApp(page);
  await go(page, "Organizador de gaveta");
  const field = (label: string) => page.getByLabel(new RegExp(`^${label}`));
  for (const [label, v] of [["Largura", "300"], ["Profundidade", "215"], ["Altura livre", "80"]] as const) await field(label).fill(v);
  await expect(page.getByText(/Cabem 7 × 5 casas/)).toBeVisible();
  // cada medida com o campo em foco: a gaveta acende a cota dele
  for (const [label, name] of [["Largura", "largura"], ["Profundidade", "profundidade"], ["Altura livre", "altura"]] as const) {
    await field(label).focus();
    await expect(page.locator(".drawer-view")).toHaveAttribute("aria-label", /medindo/);
    await page.waitForTimeout(600);
    await shot(page, page.locator(".drawer-view"), `gaveta-${name}`);
  }

  await page.setViewportSize({ width: 1180, height: 900 }); // a grade inteira à vista para arrastar
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "Grade", exact: true }).click();
  await drag(page, 7, 5, [0, 0], [1, 0]);
  await page.getByLabel("Etiqueta (texto)").fill("Pregos");
  await drag(page, 7, 5, [2, 0], [3, 1]);
  await page.getByLabel("Etiqueta (texto)").fill("Parafusos");
  await drag(page, 7, 5, [4, 0], [4, 2]);
  await drag(page, 7, 5, [0, 3], [6, 4]);
  // tira a seleção (Esc no editor) e o foco, para a foto sair limpa
  await page.locator("svg.drawer-editor [role=button]").first().focus();
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "Organizador de gaveta", level: 1 }).click();
  await shot(page, page.locator(".preview-col .card", { has: page.locator("svg.drawer-editor") }), "gaveta-grade");

  await page.setViewportSize({ width: 1640, height: 640 });
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "Gaveta", exact: true }).click();
  await expect(page.locator(".drawer-view")).toHaveAttribute("aria-label", /organizador montado dentro/, { timeout: 90_000 });
  await page.waitForTimeout(800);
  await shot(page, page.locator(".drawer-view"), "gaveta-montada");
});
