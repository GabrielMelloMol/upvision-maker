import AxeBuilder from "@axe-core/playwright";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });

async function openKit(page: Page, search: string, name: string) {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(search);
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name, exact: true }).click();
  await idle(page);
}

test("kits de montar: galeria com os 3 kits, bicho e baú geram o cartão e salvam o 3MF sem o montado; axe claro e escuro", async ({ page, tauri }) => {
  await openKit(page, "Bicho", "Bicho de 4 patas (kit)");
  const gallery = page.getByRole("group", { name: "Escolha o kit" });
  await expect(gallery.getByRole("button")).toHaveCount(3);
  await expect(gallery.getByRole("button", { name: /Bicho de 4 patas/ })).toHaveAttribute("aria-pressed", "true");
  for (const part of ["Cartão", "Corpo", "Cabeça e cauda"]) await expect(page.locator(".legend")).toContainText(part);
  await expect(page.getByText(/Para montar/)).toBeVisible();

  // personalizar: ready variant e um campo
  await page.getByRole("group", { name: "Variações prontas" }).getByRole("button", { name: "Gato", exact: true }).click();
  await idle(page);
  await page.getByLabel(/^Fatias/).fill("5");
  await idle(page);
  await expect(page.getByLabel(/^Fatias/)).toHaveValue("5");

  // escolher outro kit pela galeria
  await gallery.getByRole("button", { name: /Baú/ }).click();
  await idle(page);
  await expect(page.getByRole("heading", { name: "Baú (kit)" })).toBeVisible();
  await expect(gallery.getByRole("button", { name: /Baú/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Variações prontas" }).getByRole("button", { name: "Pequeno", exact: true }).click();
  await idle(page);
  await expect(page.getByLabel(/^Largura( \(mm\))?$/)).toHaveValue("44");
  await expect(page.getByText(/empurre um pino/)).toBeVisible();

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const xml = strFromU8(unzipSync(new Uint8Array([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1]))["3D/3dmodel.model"]);
  expect(xml).not.toContain("Montado");

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(1500); // as cores têm transição: mede depois que assentam
    const axe = await new AxeBuilder({ page }).include("main").exclude("canvas").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations.filter((v) => !v.nodes.every((n) => n.target.join(" ").includes("hud"))).map((v) => `${scheme} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});
