import type { Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { expect, go, openApp, test, toastWith } from "./tauri";

const SHOTS = process.env.SHOTS_DIR;
const STAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M10 0 L13 7 L20 7 L14 12 L16 20 L10 15 L4 20 L6 12 L0 7 L7 7 Z"/></svg>';
const idle = (page: Page) => expect(page.locator(".viewer")).not.toHaveAttribute("aria-busy", "true", { timeout: 60_000 });

async function pickModel(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(name);
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name, exact: true }).click();
}

test("camadas livres: desenho e texto na placa, arrastar com encaixe, campos, desfazer, variação e 3MF (#26)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await pickModel(page, "Placa de sinalização");
  await expect(page.locator(".viewer .hud")).toContainText("mm", { timeout: 60_000 });
  const panel = page.getByRole("region", { name: "Camadas livres" });

  // desenho próprio (SVG) entra no centro da face, em relevo
  await panel.getByLabel("Arquivo do desenho").setInputFiles({ name: "estrela.svg", mimeType: "image/svg+xml", buffer: Buffer.from(STAR) });
  await expect(panel.getByRole("list", { name: "Camadas" }).getByRole("listitem")).toHaveCount(1);
  const gizmo = page.getByRole("group", { name: /Vista de cima/ });
  await expect(gizmo).toBeVisible();
  await expect(gizmo.locator(".gizmo-layer")).toHaveCount(1, { timeout: 60_000 });
  await idle(page);

  // arrastar para a direita e voltar perto do centro: gruda em X = centro
  const x0 = Number(await panel.getByLabel("X (mm)").inputValue());
  await gizmo.scrollIntoViewIfNeeded();
  const box = (await gizmo.locator(".gizmo-layer path").first().boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 5 });
  await page.mouse.up();
  const moved = Number(await panel.getByLabel("X (mm)").inputValue());
  expect(moved).toBeGreaterThan(x0 + 5);
  await page.mouse.move(cx + 60, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 2, cy, { steps: 5 });
  await expect(gizmo.locator(".gizmo-guide")).not.toHaveCount(0); // guia do encaixe aparece
  await page.mouse.up();
  await expect(panel.getByLabel("X (mm)")).toHaveValue(String(x0));

  // desfazer volta para a posição movida
  await panel.getByRole("button", { name: "Desfazer" }).click();
  await expect(panel.getByLabel("X (mm)")).toHaveValue(String(moved));
  await panel.getByRole("button", { name: "Refazer" }).click();
  await expect(panel.getByLabel("X (mm)")).toHaveValue(String(x0));

  // texto livre, gravado, girado pelo campo
  await panel.getByRole("button", { name: "Adicionar texto" }).click();
  await panel.getByLabel("Texto", { exact: true }).fill("ABERTO");
  await panel.getByLabel("Y (mm)").fill("-8");
  await panel.getByLabel("Giro (°)").fill("10");
  await panel.getByRole("group", { name: "Aplicação" }).getByRole("button", { name: "Gravado" }).click();
  await expect(panel.getByRole("list", { name: "Camadas" }).getByRole("listitem")).toHaveCount(2);
  await idle(page);
  if (SHOTS) await gizmo.locator("xpath=..").screenshot({ path: `${SHOTS}/modelos-camadas.png` });

  // salvar como variação e reaplicar depois de apagar as camadas
  await page.getByRole("button", { name: "Salvar como variação" }).click();
  await page.getByLabel("Nome da variação").fill("Placa da loja");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(toastWith(page, "Variação “Placa da loja” salva.")).toBeVisible();
  expect((tauri.db.prepare("SELECT COUNT(*) AS n FROM model_variants").get() as { n: number }).n).toBe(1);
  await panel.getByRole("button", { name: /^Excluir ABERTO/ }).click();
  await expect(panel.getByRole("list", { name: "Camadas" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("group", { name: "Minhas variações" }).getByRole("button", { name: "Placa da loja", exact: true }).click();
  await expect(panel.getByRole("list", { name: "Camadas" }).getByRole("listitem")).toHaveCount(2);

  // 3MF: o desenho em relevo vira uma parte a mais
  await idle(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const file = [...tauri.files].find(([p]) => p.endsWith(".3mf"))![1];
  const zip = unzipSync(new Uint8Array(file));
  const text = Object.entries(zip).filter(([n]) => n.endsWith(".model") || n.endsWith(".config")).map(([, v]) => strFromU8(v)).join("\n");
  expect(text).toContain("Desenho 1");
});
