import { mkdirSync, writeFileSync } from "node:fs";
import { openApp, test } from "./tauri";

// Protótipo da foto realista (#251): `npm run photos` (fora disso, pula). Render por path tracing na própria página
// (src/thumbs/photo). PHOTO_IDS=a,b  PHOTO_FILAMENT=pla|silk|petg  PHOTO_BACKDROP=studio|wood  PHOTO_SAMPLES=200  PHOTO_TAG=x
const OUT = "node_modules/.cache/photos";

test("fotos realistas dos modelos", async ({ page }) => {
  test.skip(!process.env.PHOTOS, "só com PHOTOS=1 (npm run photos)");
  test.setTimeout(3_600_000);
  await openApp(page);
  mkdirSync(OUT, { recursive: true });
  const load = () => page.evaluate(async () => !!(await import(/* @vite-ignore */ "/src/thumbs/photo/models.ts")).photoModels).catch(() => false);
  for (let i = 0; i < 3 && !(await load()); i++) {
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);
  }
  const ids = (process.env.PHOTO_IDS ?? "keychain,organizer,medal,pix,thermo").split(",").filter(Boolean);
  const arg = { filament: process.env.PHOTO_FILAMENT ?? "pla", backdrop: process.env.PHOTO_BACKDROP ?? "studio", samples: Number(process.env.PHOTO_SAMPLES ?? 200), fStop: process.env.PHOTO_FSTOP ? Number(process.env.PHOTO_FSTOP) : undefined, warm: Number(process.env.PHOTO_WARM ?? 1), extra: JSON.parse(process.env.PHOTO_OPTS ?? "{}") };
  const tag = process.env.PHOTO_TAG ?? `${arg.filament}-${arg.backdrop}`;
  const times: Record<string, unknown> = {};
  for (const id of ids) {
    if (process.env.PHOTO_BASE) {
      // a miniatura atual (rasterizada) da mesma peça, para a prancha comparar com a foto
      const url = await page.evaluate(async (id) => {
        const { photoModels } = await import(/* @vite-ignore */ "/src/thumbs/photo/models.ts");
        const { renderModels } = await import(/* @vite-ignore */ "/src/thumbs/renderThumb.ts");
        return renderModels(await photoModels(id as never), 1280, 960, { studio: true, png: true });
      }, id);
      writeFileSync(`${OUT}/${id}-${tag}.png`, Buffer.from(url.split(",")[1], "base64"));
      continue;
    }
    const r = await page.evaluate(
      async ({ id, arg }) => {
        const { photoModels } = await import(/* @vite-ignore */ "/src/thumbs/photo/models.ts");
        const { renderPhoto, warmUp } = await import(/* @vite-ignore */ "/src/thumbs/photo/render.ts");
        const models = await photoModels(id as never);
        const o = { filament: arg.filament as never, backdrop: arg.backdrop as never };
        if (!(window as { warmed?: boolean }).warmed) {
          (window as { warmed?: boolean }).warmed = true;
          for (let i = 0; i < arg.warm; i++) await warmUp(models, o);
        }
        return renderPhoto(models, { filament: arg.filament as never, backdrop: arg.backdrop as never, samples: arg.samples, fStop: arg.fStop, ...arg.extra });
      },
      { id, arg },
    );
    writeFileSync(`${OUT}/${id}-${tag}.png`, Buffer.from(r.url.split(",")[1], "base64"));
    times[id] = { ms: Math.round(r.ms), samples: r.samples, setupMs: Math.round(r.setupMs), gpu: r.gpu };
    console.log(`foto ${id} ${tag}: preparo ${Math.round(r.setupMs)} ms + ${Math.round(r.ms)} ms em ${r.samples} amostras (${r.gpu})`);
  }
  writeFileSync(`${OUT}/tempos-${tag}.json`, JSON.stringify(times, null, 1));
});
