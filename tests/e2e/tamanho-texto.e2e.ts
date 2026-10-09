import { expect, go, openApp, prefsSection, test } from "./tauri";

test("tamanho do texto (#144): Ajustes → Preferências → Aparência pede o zoom ao app e vale de novo ao reabrir", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Ajustes");
  await prefsSection(page, "Aparência");
  const group = page.getByRole("group", { name: "Tamanho do texto" });
  await group.getByRole("button", { name: "Grande" }).click();
  await expect.poll(() => tauri.zoom).toBe(1.15);
  await expect(group.getByRole("button", { name: "Grande" })).toHaveAttribute("aria-pressed", "true");
  tauri.zoom = undefined;
  await page.reload();
  await expect.poll(() => tauri.zoom).toBe(1.15); // reaplicado na abertura
});
