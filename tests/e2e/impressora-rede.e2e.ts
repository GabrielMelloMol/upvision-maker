import { expect, go, openApp, test } from "./tauri";

// #15: SHOTS=<pasta> guarda o print.
const SHOTS = process.env.SHOTS;

test("impressora na rede: procura, conecta com o código e mostra o andamento", async ({ page, tauri }) => {
  await openApp(page);
  await go(page, "Impressoras");
  await page.getByRole("button", { name: "Conectar uma Bambu" }).click();
  await page.getByRole("button", { name: "Procurar na rede" }).click();
  await expect(page.getByLabel("Endereço IP")).toHaveValue("192.168.68.59");
  await page.getByLabel(/Código de acesso/).fill("12345678");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/conectar.png` });
  await page.getByRole("button", { name: "Conectar", exact: true }).click();
  await expect(page.getByText("A1 combo")).toBeVisible();
  // relatório como a A1 manda (o evento do Rust)
  const handlers = tauri.listeners!.filter((l) => l.event === "printer-report").map((l) => l.handler);
  const report = JSON.stringify({ print: { gcode_state: "RUNNING", subtask_name: "chaveiro", mc_percent: 45, mc_remaining_time: 83, layer_num: 30, total_layer_num: 120, nozzle_temper: 220, bed_temper: 60, ams: { ams: [{ tray: [{ tray_type: "PLA", tray_color: "FF5500FF", remain: 80 }, { tray_type: "PETG", tray_color: "1E88E5FF", remain: 35 }] }] } } });
  await page.evaluate(([hs, r]) => hs.forEach((h) => (window as unknown as Record<string, (e: unknown) => void>)[`_${h}`]({ event: "printer-report", id: 0, payload: { serial: "03900D611528416", report: r } })), [handlers, report] as const);
  await expect(page.getByText(/chaveiro · 45% · faltam 1 h 23 min/)).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/andamento.png`, fullPage: true });
  expect(JSON.parse((tauri.db.prepare("SELECT value FROM secrets WHERE key = 'bambu_links'").get() as { value: string }).value)[0]).toMatchObject({ serial: "03900D611528416", pin: "b".repeat(64) });
});
