import type { Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { expect, go, openApp, test, toastWith } from "./tauri";

const idle = (page: Page) => expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });

test("Meu AMS: filamentos nos slots, cores do chaveiro escolhidas entre eles e 3MF com a extrusora = slot (#98)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras"); // cria o banco
  tauri.db.exec("INSERT INTO filaments (material, color, brand, pricePerKg) VALUES ('PLA', 'Preto', 'Bambu', 110), ('PLA', 'Amarelo', 'Bambu', 110)");
  await go(page, "Preferências");
  const card = page.getByRole("region", { name: "Meu AMS" });
  await card.getByLabel("Slot 2").selectOption({ label: "PLA Preto (Bambu)" });
  await card.getByLabel("Slot 3").selectOption({ label: "PLA Amarelo (Bambu)" });
  // grava na hora (#165)
  await expect.poll(() => (() => {
    const row = tauri.db.prepare("SELECT data FROM settings").get() as { data: string } | undefined;
    return row ? JSON.parse(row.data).ams.filaments : undefined;
  })()).toEqual([null, 1, 2, null]);

  await go(page, "Chaveiros");
  await page.getByRole("radiogroup", { name: "Cor da base: seus filamentos" }).getByRole("radio", { name: "Slot 2 · PLA Preto (Bambu)" }).click();
  await page.getByRole("radiogroup", { name: "Cor do texto: seus filamentos" }).getByRole("radio", { name: "Slot 3 · PLA Amarelo (Bambu)" }).click();
  await idle(page);
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  const file = [...tauri.files.entries()].find(([p]) => p.endsWith(".3mf"))![1];
  const cfg = strFromU8(unzipSync(new Uint8Array(file))["Metadata/model_settings.config"]);
  const parts = [...cfg.matchAll(/<part[^>]*><metadata key="name" value="([^"]*)"\/><metadata key="extruder" value="(\d+)"/g)].map((m) => `${m[1]}=${m[2]}`);
  expect(parts).toEqual(expect.arrayContaining([expect.stringMatching(/=2$/), expect.stringMatching(/=3$/)]));
});
