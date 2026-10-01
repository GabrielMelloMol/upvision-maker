import { mkdirSync, writeFileSync } from "node:fs";
import { openApp, test } from "./tauri";

// Gera as miniaturas dos Modelos prontos (#149): `npm run thumbs` (fora disso, pula). O render roda na própria página
// (three.js e manifold do app, src/thumbs/renderThumb.ts). Grava fora de src/ (o Vite recarregaria a cada arquivo) e
// fora de test-results/ (o Playwright apaga a pasta ao começar); o script copia para src/assets/model-thumbs.
// THUMBS_IDS=a,b gera só esses.
const OUT = "node_modules/.cache/model-thumbs";

test("miniaturas dos modelos prontos", async ({ page }) => {
  test.skip(!process.env.THUMBS, "só com THUMBS=1 (npm run thumbs)");
  test.setTimeout(1_800_000);
  await openApp(page);
  mkdirSync(OUT, { recursive: true });
  // 1º import: o Vite pode otimizar dependências novas e recarregar a página; espera e tenta de novo
  for (let i = 0; i < 3; i++) {
    const ok = await page.evaluate(async () => !!(await import(/* @vite-ignore */ "/src/thumbs/renderThumb.ts")).renderThumb).catch(() => false);
    if (ok) break;
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);
  }
  const only = process.env.THUMBS_IDS?.split(",").filter(Boolean);
  const ids: string[] = only?.length ? only : await page.evaluate(async () => (await import(/* @vite-ignore */ "/src/thumbs/renderThumb.ts")).thumbIds());
  const failed: string[] = [];
  for (const id of ids) {
    const url = await page
      .evaluate(async (m) => (await import(/* @vite-ignore */ "/src/thumbs/renderThumb.ts")).renderThumb(m), id)
      .catch((e: unknown) => {
        failed.push(`${id} (${String(e).slice(0, 120)})`);
        return null;
      });
    if (!url?.startsWith("data:image/webp")) {
      if (url) failed.push(`${id} (sem WebP)`);
      continue;
    }
    writeFileSync(`${OUT}/${id}.webp`, Buffer.from(url.split(",")[1], "base64"));
  }
  console.log(`miniaturas: ${ids.length - failed.length} de ${ids.length}${failed.length ? `; falharam: ${failed.join("; ")}` : ""}`);
  if (failed.length) throw new Error(`miniaturas que falharam: ${failed.join("; ")}`);
});
