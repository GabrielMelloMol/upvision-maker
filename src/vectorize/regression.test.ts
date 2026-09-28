import { gunzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_TRACE, prepare, type TraceOptions } from "./pipeline";
import { scaleFactor } from "./raster";
import { loadFixture } from "./testFixtures";
import { vectorizeMask } from "./vtrace";

// ImageData não existe no Node; o vtracer só lê data/width/height.
class NodeImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}
(globalThis as { ImageData?: unknown }).ImageData ??= NodeImageData;

async function run(name: string, o: Partial<TraceOptions>, seg?: Uint8Array) {
  const raw = loadFixture(name);
  const f = loadFixture(name, Math.round(Math.max(raw.w, raw.h) * scaleFactor(raw.w, raw.h)));
  const t0 = performance.now();
  const p = prepare(f.rgba, f.w, f.h, { ...DEFAULT_TRACE, ...o }, seg);
  const d = await vectorizeMask(p.mask, f.w, f.h, o.detail ?? DEFAULT_TRACE.detail);
  return { paths: (d.match(/M/g) ?? []).length, ms: performance.now() - t0, bytes: d.length, p, f };
}

const MAX_MS = 20_000; // pega travamento, não lentidão: isolado leva < 1 s, com cobertura em paralelo 8–9 s

describe("regressão de vetorização (tests/fixtures)", () => {
  test("logo simples: poucos caminhos", async () => {
    const r = await run("logo.jpg", {});
    expect(r.paths).toBeGreaterThanOrEqual(5); // círculo, estrela, D-O-C-E (+ miolos)
    expect(r.paths).toBeLessThan(20);
    expect(r.ms).toBeLessThan(MAX_MS);
  }, 30_000);

  test("desenho de linha: contorno + olhos + boca", async () => {
    const r = await run("desenho.jpg", {});
    expect(r.paths).toBeGreaterThanOrEqual(4);
    expect(r.paths).toBeLessThan(15);
    expect(r.ms).toBeLessThan(MAX_MS);
  }, 30_000);

  test("foto de pessoa no modo Silhueta: contorno único e liso (< 50 caminhos)", async () => {
    // máscara gerada pelo MediaPipe Selfie Segmenter no app (não roda no Node); ver tests/fixtures/README.md
    const seg = gunzipSync(readFileSync(resolve(__dirname, "../../tests/fixtures/foto-pessoa.seg.gz")));
    const r = await run("foto-pessoa.jpg", { mode: "silhouette" }, seg);
    expect(r.f.w * r.f.h).toBe(seg.length);
    expect(r.paths).toBeGreaterThanOrEqual(1);
    expect(r.paths).toBeLessThan(50);
    expect(r.p.fillPct).toBeGreaterThan(25); // a pessoa ocupa boa parte do retrato
    expect(r.ms).toBeLessThan(MAX_MS);
  }, 30_000);

  test("foto no modo logo com limpeza padrão já não vira milhares de caminhos", async () => {
    const r = await run("foto-pessoa.jpg", {});
    expect(r.paths).toBeLessThan(1500);
  }, 30_000);
});
