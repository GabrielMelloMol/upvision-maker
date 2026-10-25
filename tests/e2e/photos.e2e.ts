import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { openApp, test } from "./tauri";

// Foto realista (#251): `npm run photos` (fora disso, pula). Render por path tracing na própria página (src/thumbs/photo).
// PHOTO_IDS=a,b  PHOTO_FILAMENT=pla|silk|petg  PHOTO_BACKDROP=studio|wood  PHOTO_SAMPLES=300  PHOTO_TAG=x  PHOTO_BEVEL=0|1
// PHOTO_BASE=1 (miniatura atual da mesma peça)  PHOTO_ALL=1 (cena genérica de todos os modelos prontos, com tempos)
const OUT = "node_modules/.cache/photos";

test("fotos realistas dos modelos", async ({ page }) => {
  test.skip(!process.env.PHOTOS, "só com PHOTOS=1 (npm run photos)");
  test.setTimeout(7_200_000);
  await openApp(page);
  page.on("console", (m) => m.text().startsWith("PHOTO:") && console.log(m.text()));
  mkdirSync(OUT, { recursive: true });
  const load = () => page.evaluate(async () => !!(await import(/* @vite-ignore */ "/src/thumbs/photo/models.ts")).photoScene).catch(() => false);
  for (let i = 0; i < 3 && !(await load()); i++) {
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);
  }
  const all = !!process.env.PHOTO_ALL;
  const ids = all
    ? await page.evaluate(async () => (await import(/* @vite-ignore */ "/src/thumbs/renderThumb.ts")).thumbIds())
    : (process.env.PHOTO_IDS ?? "keychain,organizer,medal,pix,thermo").split(",").filter(Boolean);
  const only = process.env.PHOTO_ONLY?.split(",").filter(Boolean);
  const arg = {
    filament: process.env.PHOTO_FILAMENT ?? "pla",
    backdrop: process.env.PHOTO_BACKDROP ?? "wood",
    samples: Number(process.env.PHOTO_SAMPLES ?? 300),
    bevel: process.env.PHOTO_BEVEL !== "0",
    warm: Number(process.env.PHOTO_WARM ?? 1),
    extra: JSON.parse(process.env.PHOTO_OPTS ?? "{}"),
    all,
    special: ["keychain", "organizer", "medal", "pix", "thermo", "vessel", "pixel", "micHolder"],
  };
  const tag = process.env.PHOTO_TAG ?? `${arg.filament}-${arg.backdrop}`;
  const times: Record<string, unknown> = {};
  for (const id of only?.length ? only : ids) {
    if (all && !process.env.PHOTO_FORCE && existsSync(`${OUT}/${id}-${tag}.png`)) continue; // retoma o lote de onde parou
    if (process.env.PHOTO_BASE) {
      // a miniatura atual (rasterizada) da mesma peça, para a prancha comparar
      const url = await page.evaluate(async (id) => {
        const { photoScene } = await import(/* @vite-ignore */ "/src/thumbs/photo/models.ts");
        const { renderModels } = await import(/* @vite-ignore */ "/src/thumbs/renderThumb.ts");
        const s = await photoScene(id as never, { bevel: false });
        return renderModels(s.items[0].models, 1280, 960, { studio: true, png: true });
      }, id);
      writeFileSync(`${OUT}/${id}-${tag}.png`, Buffer.from(url.split(",")[1], "base64"));
      continue;
    }
    const r = await page
      .evaluate(
        async ({ id, arg }) => {
          const { photoScene, genericScene } = await import(/* @vite-ignore */ "/src/thumbs/photo/models.ts");
          const { renderPhoto, warmUp } = await import(/* @vite-ignore */ "/src/thumbs/photo/render.ts");
          const t0 = performance.now();
          const scene = arg.all && !arg.special.includes(id) ? await genericScene(id, { bevel: arg.bevel }) : await photoScene(id as never, { bevel: arg.bevel });
          const sceneMs = performance.now() - t0;
          const o = { filament: arg.filament as never, backdrop: arg.backdrop as never, samples: arg.samples, ...arg.extra };
          const w = window as { warmed?: boolean };
          if (!w.warmed) {
            w.warmed = true;
            for (let i = 0; i < arg.warm; i++) await warmUp(scene, o);
          }
          return { ...(await renderPhoto(scene, o)), sceneMs };
        },
        { id, arg },
      )
      .catch((e: unknown) => ({ error: String(e).slice(0, 160) }));
    if ("error" in r) {
      times[id] = { error: r.error };
      console.log(`foto ${id}: ERRO ${r.error}`);
      continue;
    }
    writeFileSync(`${OUT}/${id}-${tag}.png`, Buffer.from(r.url.split(",")[1], "base64"));
    times[id] = { sceneMs: Math.round(r.sceneMs), setupMs: Math.round(r.setupMs), ms: Math.round(r.ms), samples: r.samples, gpu: r.gpu };
    console.log(`foto ${id} ${tag}: cena ${Math.round(r.sceneMs)} ms + preparo ${Math.round(r.setupMs)} ms + ${Math.round(r.ms)} ms em ${r.samples} amostras`);
  }
  writeFileSync(`${OUT}/tempos-${tag}.json`, JSON.stringify(times, null, 1));
});
