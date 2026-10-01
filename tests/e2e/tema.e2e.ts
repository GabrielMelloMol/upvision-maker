import { expect, go, openApp, test } from "./tauri";

test("claro/escuro (#152): sol/lua na barra lateral, ⌘⇧L, ⌘K e Ajustes → Aparência; vale de novo ao reabrir", async ({ page, tauri }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openApp(page);
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("button", { name: "Modo escuro" }).click();
  await expect.poll(() => tauri.theme).toBe("dark");

  // a busca troca para Automático (a janela volta a seguir o sistema)
  await page.keyboard.press("ControlOrMeta+K");
  await page.getByRole("combobox").fill("automática");
  await page.getByRole("option", { name: /Aparência automática/ }).click();
  await expect.poll(() => tauri.theme).toBeNull();

  await page.keyboard.press("ControlOrMeta+Shift+L");
  await expect.poll(() => tauri.theme).toBe("dark");

  await go(page, "Ajustes");
  const group = page.getByRole("group", { name: "Tema" });
  await expect(group.getByRole("button", { name: "Escuro" })).toHaveAttribute("aria-pressed", "true");
  await group.getByRole("button", { name: "Claro" }).click();
  await expect.poll(() => tauri.theme).toBe("light");
  tauri.theme = undefined;
  await page.reload();
  await expect.poll(() => tauri.theme).toBe("light"); // reaplicado na abertura
});
