import { expect, openApp, test } from "./tauri";

test("erro visto vira registro; 'Enviar diagnóstico' leva versão, sistema e o erro, sem dados pessoais (#7)", async ({ page, tauri }) => {
  await openApp(page);
  tauri.files.set("/Users/ana/Downloads/ruim.json", Buffer.from('{"foo": 1}'));
  tauri.nextOpen = "/Users/ana/Downloads/ruim.json";
  await page.getByRole("button", { name: "Restaurar backup" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "não é um backup" })).toBeVisible();
  await expect.poll(() => tauri.log.join("\n")).toContain("não é um backup do UpVision Maker");

  await page.getByRole("button", { name: "Sugerir ferramenta" }).click();
  const sheet = page.getByRole("dialog", { name: "Sugerir ferramenta" });
  await sheet.getByLabel("O que você queria que o app fizesse?").fill("Restaurar deu erro");
  await sheet.getByRole("button", { name: "Enviar diagnóstico" }).click();
  await expect.poll(() => tauri.opened.length).toBe(1);
  const url = new URL(tauri.opened[0]);
  expect(url.searchParams.get("title")).toBe("Diagnóstico: Restaurar deu erro");
  const body = url.searchParams.get("body")!;
  expect(body).toMatch(/UpVision Maker v0\.2\.0 \(build \d{4}-\d{2}-\d{2}\)/);
  expect(body).toContain("não é um backup do UpVision Maker");
});
