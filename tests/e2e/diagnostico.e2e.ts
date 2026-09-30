import { expect, go, openApp, test } from "./tauri";

test("erro visto vira registro; o diagnóstico vai junto na mensagem, sem GitHub nem e-mail (#7, #83)", async ({ page, tauri }) => {
  // guarda o que for copiado (o build de teste não tem endpoint nem WhatsApp: sobra 'Copiar texto')
  await page.addInitScript(() => {
    const w = window as unknown as { __copied: string[] };
    w.__copied = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (s: string) => void w.__copied.push(s) }, configurable: true });
  });
  await openApp(page);
  tauri.files.set("/Users/ana/Downloads/ruim.json", Buffer.from('{"foo": 1}'));
  tauri.nextOpen = "/Users/ana/Downloads/ruim.json";
  await go(page, "Ajustes");
  await page.getByRole("button", { name: "Restaurar backup" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "não é um backup" })).toBeVisible();
  await expect.poll(() => tauri.log.join("\n")).toContain("não é um backup do UpVision Maker");

  await page.getByRole("button", { name: "Sugerir ferramenta" }).click();
  const sheet = page.getByRole("dialog", { name: "Sugerir ferramenta" });
  await expect(sheet.getByRole("button", { name: /GitHub|e-mail/i })).toHaveCount(0);
  await sheet.getByLabel("O que você queria que o app fizesse?").fill("Restaurar deu erro");
  await sheet.getByRole("checkbox", { name: "Mandar junto o diagnóstico" }).check();
  await sheet.getByRole("button", { name: "Copiar texto" }).click();
  await expect(sheet.getByText(/Texto copiado\. Cole/)).toBeVisible();
  const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied[0]);
  expect(copied).toMatch(/^\[UpVision Maker\] Sugestão: Restaurar deu erro/);
  expect(copied).toMatch(/UpVision Maker v0\.2\.0 \(build \d{4}-\d{2}-\d{2}\)/);
  expect(copied).toContain("não é um backup do UpVision Maker");
  expect(tauri.opened).toHaveLength(0);
});
