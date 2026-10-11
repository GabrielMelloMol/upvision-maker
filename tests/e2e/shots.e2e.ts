import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, go, openApp, test, toastWith } from "./tauri";

// Prints dos kits para conferir (SHOTS=1, saída em SHOTS_OUT): cartão, montado ¾, frente, lado, baú aberto, galeria e os 3MF.
// Tudo no navegador de teste (sem mouse nem tela do Mac).
const OUT = process.env.SHOTS_OUT ?? "test-results/shots";
const KITS = [
  { id: "kitBicho", name: "Bicho", file: "bicho-cachorro", variant: "Cachorro", patch: { head: "dog", tail: "up", profile: "oval" } },
  { id: "kitBicho", name: "Bicho", file: "bicho-dino", variant: "Saurópode", patch: { head: "sauro", tail: "thick", profile: "oval" } },
  { id: "kitBicho", name: "Bicho", file: "bicho-trex", variant: "T-rex", patch: { head: "trex", tail: "thick", profile: "boxy" } },
  { id: "kitBau", name: "Baú", file: "bau", variant: "Médio", patch: {}, open: true },
];

async function saved3mf(page: Page, tauri: { files: Map<string, Uint8Array> }): Promise<Buffer> {
  tauri.files.clear();
  await page.getByRole("button", { name: /Salvar 3MF/ }).click();
  await expect(toastWith(page, "Arquivo salvo em")).toBeVisible();
  return Buffer.from([...tauri.files].find(([p]) => p.endsWith(".3mf"))![1]);
}

test("prints dos kits Bicho e Baú", async ({ page, tauri }) => {
  test.skip(!process.env.SHOTS, "só com SHOTS=1");
  test.setTimeout(900_000);
  mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openApp(page);
  await go(page, "Modelos prontos");
  for (const kit of KITS) {
    await page.getByRole("searchbox", { name: "Buscar modelo" }).fill(kit.id === "kitBau" ? "Baú" : "Bicho");
    await page.getByRole("group", { name: "Modelo" }).getByRole("button", { name: kit.name, exact: true }).click();
    await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
    await page.getByRole("group", { name: "Variações prontas" }).getByRole("button", { name: kit.variant, exact: true }).click();
    await expect(page.locator(".viewer .overlay.busy")).toHaveCount(0, { timeout: 90_000 });
    if (kit.file === "bicho-cachorro") {
      await page.setViewportSize({ width: 1900, height: 900 }); // a prateleira inteira, sem rolar
      await page.addStyleTag({ content: ".kit-gallery { flex-wrap: wrap; }" }); // para a foto, os cards em fileiras
      await page.locator(".kit-gallery").screenshot({ path: `${OUT}/galeria.png` });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    writeFileSync(`${OUT}/${kit.file}.3mf`, await saved3mf(page, tauri));
    const shots = await page.evaluate(
      async ({ id, patch, open, forward }) => {
        const { kitShots } = await import(/* @vite-ignore */ "/src/thumbs/shots.ts");
        const axis = open ? await import(/* @vite-ignore */ "/src/geometry/kit/designs/bau.ts").then((m) => m.bauDims(m.DEFAULT_BAU, { t: 1.6, fit: 0.2 })) : null;
        return kitShots(id, patch, axis ? { hingeU: axis.hingeU, hingeV: axis.hingeV } : undefined, forward);
      },
      { id: kit.id, patch: kit.patch, open: !!kit.open, forward: kit.id === "kitBau" ? ("-y" as const) : ("x" as const) },
    );
    for (const [name, url] of Object.entries(shots)) writeFileSync(`${OUT}/${kit.file}-${name}`, Buffer.from(url.split(",")[1], "base64"));
  }
});
