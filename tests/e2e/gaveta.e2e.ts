import type { Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { expect, go, openApp, test, toastWith } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;
const objects3mf = (buf: Buffer) => (strFromU8(unzipSync(new Uint8Array(buf))["3D/3dmodel.model"]).match(/<object id="\d+" name="[^"]*" type="model"><components>/g) ?? []).length;

/** Arrasta da casa (c0, r0) até (c1, r1); fileira 0 é a da frente (embaixo no desenho). */
async function dragCells(page: Page, cols: number, rows: number, from: [number, number], to: [number, number]) {
  const svg = page.locator("svg.drawer-editor");
  const b = (await svg.boundingBox())!;
  const cw = b.width / cols, ch = b.height / rows;
  const at = ([c, r]: [number, number]) => [b.x + (c + 0.5) * cw, b.y + b.height - (r + 0.5) * ch] as const;
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps: 4 });
  await page.mouse.up();
}

test("organizador de gaveta: 4 × 3 casas, 3 caixinhas desenhadas, ajuste e exportação (#140)", async ({ page, tauri }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await openApp(page);
  await go(page, "Organizador de gaveta");
  for (const [label, v] of [["Largura", "169"], ["Profundidade", "127"], ["Altura livre", "60"]] as const) await page.getByLabel(new RegExp(`^${label}`)).fill(v);
  await expect(page.getByText(/Cabem 4 × 3 casas.*A base sai em 1 pedaço\./)).toBeVisible();
  await dragCells(page, 4, 3, [0, 0], [1, 0]); // 2×1 na frente à esquerda
  await expect(page.getByRole("heading", { name: "Caixinha 2×1" })).toBeVisible();
  await page.getByLabel("Etiqueta (texto)").fill("Pregos");
  await dragCells(page, 4, 3, [2, 0], [2, 1]); // 1×2
  await dragCells(page, 4, 3, [0, 2], [3, 2]); // 4×1 no fundo
  const mods = page.getByRole("button", { name: /^Caixinha \d×\d, altura/ });
  await expect(mods).toHaveCount(3);
  // teclado: a do fundo desce não dá (tem a 1×2 embaixo na coluna 2); duplica a 2×1 com ⌘D
  await page.getByRole("button", { name: /^Caixinha 2×1, altura 3, coluna 1, fileira 1, etiqueta Pregos/ }).focus();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(mods).toHaveCount(4);
  await page.keyboard.press("Delete");
  await expect(mods).toHaveCount(3);
  if (SHOTS)
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.waitForTimeout(400); // transição do tema
      await page.screenshot({ path: `${SHOTS}/gaveta-${scheme}.png`, fullPage: true });
    }
  await page.getByRole("group", { name: "Prévia" }).getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator(".viewer .hud")).toContainText("168.0 × 126.0", { timeout: 90_000 });
  await expect(page.locator(".viewer")).not.toHaveAttribute("aria-busy", "true", { timeout: 90_000 });
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  // base + 3 caixinhas + etiqueta
  expect(objects3mf([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1])).toBe(5);

  // impressão por mesa: lista com a caixinha e a base, e um 3MF por mesa numa pasta
  const card = page.getByLabel("Impressão por mesa");
  await expect(card.getByRole("row", { name: /Caixinha 2×1×3 Pregos/ })).toBeVisible();
  await expect(card.getByRole("row", { name: /^Base/ })).toBeVisible();
  await expect(card.getByRole("row", { name: /Total/ })).toContainText(" g");
  await expect(card.getByText(/^Mesa 1/)).toBeVisible();
  tauri.nextOpen = "/pasta";
  await card.getByRole("button", { name: "Salvar todas as mesas numa pasta" }).click();
  await expect(page.locator(".toast", { hasText: /(mesa salva|mesas salvas) em \/pasta/ })).toBeVisible();
  const plates = [...tauri.files.keys()].filter((p) => p.startsWith("/pasta/gaveta-mesa-"));
  expect(plates.length).toBeGreaterThanOrEqual(1);
  expect(objects3mf(tauri.files.get(plates[0])!)).toBeGreaterThanOrEqual(1);
});
