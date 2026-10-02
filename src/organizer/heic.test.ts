import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import jpeg from "jpeg-js";
import factory from "libheif-js/libheif-wasm/libheif.js";
import { beforeAll, describe, expect, test } from "vitest";
import { decodeHeif, HEIF_ERROR, heifFocal35, isHeif, startLibheif, type LibHeif } from "./heic";
import { exifFocal35, findSheetCorners, focalPxFrom35, lightness, measureTools, sizeMm, type Rgba } from "./photo";

const fixture = (f: string) => new Uint8Array(readFileSync(resolve(__dirname, "../../tests/fixtures/organizador", f)));
const wasm = readFileSync(createRequire(import.meta.url).resolve("libheif-js/libheif-wasm/libheif.wasm"));
const ftyp = (...brands: string[]) => {
  const b = new Uint8Array(8 + brands.length * 4 + 4);
  b.set([0, 0, 0, b.length - 4]);
  const all = [brands[0], "\0\0\0\0", ...brands.slice(1)].join("");
  b.set([..."ftyp", ...all].map((c) => c.charCodeAt(0)), 4);
  return b;
};

let lib: LibHeif;
beforeAll(async () => {
  lib = await startLibheif(factory as never, wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
});

/** Mede a foto do Quartzo (ferramentas em A4, altura 8 mm) e devolve comprimento × largura de cada uma. */
function measure(img: Rgba, focal35: number | null) {
  const g = lightness(img);
  const r = measureTools(g, { sheet: { widthMm: 210, heightMm: 297 }, corners: findSheetCorners(g)!, heightMm: 8, focalPx: focal35 && focalPxFrom35(focal35, [img.width, img.height]) });
  return r.outlines.map((o) => sizeMm(o));
}

describe("fotos HEIC do iPhone (#169)", { timeout: 60_000 }, () => {
  test("reconhece HEIC pelo conteúdo (ftyp heic/mif1), não confunde com JPEG nem com AVIF", () => {
    expect(isHeif(fixture("ferramentas-a4-celular.heic"))).toBe(true);
    expect(isHeif(ftyp("mif1", "heic"))).toBe(true);
    expect(isHeif(ftyp("heix"))).toBe(true);
    expect(isHeif(fixture("ferramentas-a4-celular.jpg"))).toBe(false);
    expect(isHeif(ftyp("avif", "mif1", "miaf"))).toBe(false);
    expect(isHeif(ftyp("isom", "mp41"))).toBe(false); // vídeo MP4
    expect(isHeif(new Uint8Array(4))).toBe(false);
  });

  test("decodifica no WASM, lê a focal do EXIF de dentro do HEIC e mede igual ao JPEG (< 0,3 mm)", async () => {
    const heic = fixture("ferramentas-a4-celular.heic");
    const img = await decodeHeif(heic, lib);
    const jpg = jpeg.decode(fixture("ferramentas-a4-celular.jpg"), { useTArray: true });
    expect([img.width, img.height]).toEqual([jpg.width, jpg.height]);
    const f35 = await heifFocal35(heic);
    expect(f35).toBe(48);
    expect(f35).toBe(exifFocal35(fixture("ferramentas-a4-celular.jpg")));
    const fromHeic = measure(img, f35);
    const fromJpeg = measure({ data: new Uint8ClampedArray(jpg.data.buffer), width: jpg.width, height: jpg.height }, 48);
    expect(fromHeic).toHaveLength(3);
    fromHeic.forEach((s, i) => {
      expect(Math.abs(s.length - fromJpeg[i].length)).toBeLessThan(0.3);
      expect(Math.abs(s.width - fromJpeg[i].width)).toBeLessThan(0.3);
    });
  });

  test("HEIC cortado ou estragado: mensagem clara; sem EXIF: focal null", async () => {
    const heic = fixture("ferramentas-a4-celular.heic");
    await expect(decodeHeif(heic.subarray(0, 4000), lib)).rejects.toThrow(HEIF_ERROR);
    await expect(heifFocal35(ftyp("heic"))).resolves.toBeNull();
  });
});
