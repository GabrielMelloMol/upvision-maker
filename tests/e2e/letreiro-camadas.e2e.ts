import type { Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { expect, go, openApp, test, toastWith } from "./tauri";

const hud = (page: Page) => page.locator(".viewer .hud");
const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("letreiro em camadas: linhas coloridas, enfeite e base contornada; 3MF por cor (#48)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Letreiro");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Letreiro em camadas", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  await expect(page.locator(".legend")).toContainText("Linha 2");

  await page.getByLabel("Texto").nth(2).fill("da Ana");
  await page.getByRole("button", { name: "Coração" }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Linha 3");
  await expect(page.locator(".legend")).toContainText("Enfeite");

  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  expect([...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
});

test("letreiro: layouts de data prontos (nascimento, casamento, pet) com moldura separada (#117)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Modelos prontos");
  await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("Letreiro");
  await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: "Letreiro em camadas", exact: true }).click();
  await idle(page);
  await expect(hud(page)).toContainText("mm", { timeout: 60_000 });
  const presets = page.getByRole("group", { name: "Variações prontas" });
  for (const nome of ["Nascimento", "Casamento", "Casa nova", "Pet (in memoriam)"]) await expect(presets.getByRole("button", { name: nome, exact: true })).toBeVisible();

  await presets.getByRole("button", { name: "Nascimento", exact: true }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Linha 4"); // nome, data, hora, peso e altura
  await presets.getByRole("button", { name: "Pet (in memoriam)", exact: true }).click();
  await idle(page);
  await expect(page.locator(".legend")).toContainText("Enfeite");
  const saved = async () => {
    await page.getByRole("button", { name: /Salvar 3MF/ }).click();
    await expect.poll(() => [...tauri.files.keys()].some((p) => p.endsWith(".3mf"))).toBe(true);
    const file = [...tauri.files].find(([p]) => p.endsWith(".3mf"))!;
    return (strFromU8(unzipSync(new Uint8Array(file[1]))["3D/3dmodel.model"]).match(/<item /g) ?? []).length;
  };
  expect(await saved()).toBe(3); // letreiro, moldura e suporte de mesa
  tauri.files.clear();
  await page.getByRole("switch", { name: /Moldura separada/ }).uncheck();
  await idle(page);
  expect(await saved()).toBe(2); // sem a moldura
});
