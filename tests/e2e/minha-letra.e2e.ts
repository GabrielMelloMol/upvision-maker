import type { Page } from "@playwright/test";
import { expect, go, openApp, test } from "./tauri";

// #314: SHOTS=<pasta> guarda prints do quadro e da prévia.
const SHOTS = process.env.SHOTS;

/** Desenha no quadro com o mouse; pontos de 0 a 100. */
async function draw(page: Page, name: string | RegExp, strokes: [number, number][][]) {
  const pad = page.getByRole("img", { name });
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  for (const s of strokes) {
    const at = ([x, y]: [number, number]) => [box.x + (x / 100) * box.width, box.y + (y / 100) * box.height] as const;
    await page.mouse.move(...at(s[0]));
    await page.mouse.down();
    for (const p of s.slice(1)) await page.mouse.move(...at(p), { steps: 6 });
    await page.mouse.up();
  }
}

test("minha letra: desenha O, i e a, e o texto sai com elas; à mão livre vira traço", async ({ page }) => {
  await openApp(page);
  await go(page, "Desenhar com caneta");
  await page.getByRole("button", { name: "Texto", exact: true }).click();
  await page.getByRole("button", { name: "Minha letra" }).click();
  await page.getByRole("button", { name: "Desenhar a minha letra" }).click();
  await page.getByRole("group", { name: "Caracteres" }).getByRole("button", { name: "O", exact: true }).click();
  const ring = Array.from({ length: 25 }, (_, i) => [50 + 22 * Math.cos((i / 24) * 2 * Math.PI - 1.6), 45 + 25 * Math.sin((i / 24) * 2 * Math.PI - 1.6)] as [number, number]);
  await draw(page, "Quadro da letra O", [ring]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/quadro.png` });
  await page.getByRole("button", { name: "Guardar e ir para a próxima" }).click();
  await page.getByRole("group", { name: "Caracteres" }).getByRole("button", { name: "i", exact: true }).click();
  await draw(page, "Quadro da letra i", [[[48, 50], [50, 70], [56, 66]], [[49, 38], [49.5, 38.5]]]);
  await page.getByRole("button", { name: "Guardar e ir para a próxima" }).click();
  await page.getByRole("group", { name: "Caracteres" }).getByRole("button", { name: "a", exact: true }).click();
  await draw(page, "Quadro da letra a", [[[62, 52], [50, 49], [38, 58], [42, 70], [56, 66], [62, 52], [62, 68], [68, 70]]]);
  await page.getByRole("button", { name: "Guardar e ir para a próxima" }).click();
  await page.getByRole("button", { name: "Pronto" }).click();
  await page.getByRole("textbox", { name: "Texto" }).fill("Oi, Ana");
  await expect(page.getByText("3 letras desenhadas; as que faltam saem na cursiva.")).toBeVisible();
  await expect(page.locator(".plot-preview polyline").first()).toBeAttached();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/texto.png`, fullPage: true });

  // #320: a mão livre entra como outra camada, junto do texto
  const before = await page.locator(".plot-preview polyline").count();
  await page.getByRole("button", { name: "À mão livre" }).click();
  await draw(page, /mão livre/, [[[10, 80], [30, 30], [50, 70], [70, 20], [90, 80]]]);
  await expect(page.locator(".plot-preview polyline")).toHaveCount(before + 1);
});
