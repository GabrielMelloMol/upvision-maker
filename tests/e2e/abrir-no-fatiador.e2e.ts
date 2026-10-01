import { strFromU8, unzipSync } from "fflate";
import { expect, go, openApp, test, toastWith } from "./tauri";

/** Abrir no fatiador com 1 clique (#160). */
test("chaveiro: Abrir no OrcaSlicer manda o 3MF com a configuração recomendada; em Ajustes dá para escolher o fatiador", async ({ page, tauri }) => {
  tauri.slicers = [
    { id: "bambu", name: "Bambu Studio", path: "/Applications/BambuStudio.app" },
    { id: "orca", name: "OrcaSlicer", path: "/Applications/OrcaSlicer.app" },
  ];
  await openApp(page);
  await go(page, "Ajustes");
  const card = page.getByRole("region", { name: "Fatiador" });
  await expect(card.getByLabel("Abrir no")).toHaveValue("");
  await card.getByLabel("Abrir no").selectOption("orca");
  await expect(toastWith(page, "Fatiador salvo.")).toBeVisible();

  await go(page, "Chaveiros");
  await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole("button", { name: "Abrir no OrcaSlicer" }).click();
  await expect(toastWith(page, "Abrindo no OrcaSlicer.")).toBeVisible();
  expect(tauri.slicerOpened).toHaveLength(1);
  expect(tauri.slicerOpened[0].slicer).toBe("orca");
  const cfg = strFromU8(unzipSync(new Uint8Array(tauri.slicerOpened[0].model))["Metadata/model_settings.config"]);
  expect(cfg).toContain('key="layer_height"');
});

test("sem fatiador instalado: links para baixar no lugar do botão", async ({ page }) => {
  await openApp(page);
  await go(page, "Chaveiros");
  await expect(page.getByRole("button", { name: "Bambu Studio" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Abrir no/ })).toHaveCount(0);
});
