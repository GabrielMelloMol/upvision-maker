import { expect, go, openApp, test, toastWith } from "./tauri";

const DIR = "C:/Users/ana/OneDrive/UpVision";

test("dois computadores: liga pela pasta da nuvem, envia os dados e avisa quando o outro está usando (#16)", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Preferências");
  const sync = page.getByRole("region", { name: "Dois computadores" });
  await expect(sync.getByRole("switch", { name: /Sincronizar com outro computador/ })).toBeDisabled(); // pasta padrão

  tauri.nextOpen = DIR;
  await sync.getByRole("button", { name: "Escolher pasta…" }).click();
  await expect(page.getByRole("region", { name: "Backup automático" }).getByText(DIR)).toBeVisible();
  tauri.db.exec("INSERT INTO printers (name, watts) VALUES ('Bambu A1', 95)");
  await sync.getByRole("switch", { name: /Sincronizar com outro computador/ }).click();
  await expect(toastWith(page, "Sincronização ligada.")).toBeVisible();
  await expect(sync.getByText(/Última sincronização: hoje/)).toBeVisible();
  const saved = JSON.parse(tauri.autoBackups.get(DIR)!.get("upvision-sync.json")!);
  expect(saved.tables.printers.map((p: { name: string }) => p.name)).toEqual(["Bambu A1"]);

  // o outro computador abriu e pegou a trava
  const now = new Date().toISOString();
  tauri.autoBackups.get(DIR)!.set("upvision-sync.lock", JSON.stringify({ device: "outro", deviceName: "NOTE-ANA", since: now, heartbeat: now }));
  await page.reload();
  const banner = page.locator(".banner.warn", { hasText: "Em uso no computador NOTE-ANA" });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Assumir" }).click();
  await expect(banner).toBeHidden();
  await expect.poll(() => JSON.parse(tauri.autoBackups.get(DIR)!.get("upvision-sync.lock")!).deviceName).toBe("ESTE-PC");
});
