import { describe, expect, test } from "vitest";
import { exifFocal35, focalPxFrom35 } from "./camera";
import { regionLoops, signedArea, simplifyLoop } from "./contour";
import type { Pt } from "./homography";

/** Região a partir de um desenho ("#" = pixel da região). */
function region(rows: string[]) {
  const width = rows[0].length;
  const labels = new Int32Array(width * rows.length);
  rows.forEach((r, y) => [...r].forEach((c, x) => (labels[y * width + x] = c === "#" ? 1 : 0)));
  return { labels, width, id: 1, box: [0, 0, width - 1, rows.length - 1] as [number, number, number, number] };
}

describe("contornos da máscara (#169)", () => {
  test("quadrado vira 4 cantos nos cantos dos pixels, horário na tela", () => {
    const [loop] = regionLoops(region(["....", ".##.", ".##.", "...."]));
    expect(loop).toHaveLength(4);
    expect(new Set(loop.map((p) => p.join(",")))).toEqual(new Set(["1,1", "3,1", "3,3", "1,3"]));
    expect(signedArea(loop)).toBe(4); // y para baixo: horário dá positivo
  });

  test("anel: laço de fora e o furo com sentidos opostos", () => {
    const loops = regionLoops(region(["#####", "#...#", "#...#", "#####"]));
    expect(loops).toHaveLength(2);
    const areas = loops.map(signedArea).sort((a, b) => a - b);
    expect(areas).toEqual([-6, 20]);
  });

  test("pixels que só se tocam na diagonal ficam em laços separados (4-vizinhança)", () => {
    const loops = regionLoops(region(["#.", ".#"]));
    expect(loops).toHaveLength(2);
    loops.forEach((l) => expect(signedArea(l)).toBe(1));
  });

  test("simplificação tira a escadinha mas fica a menos de 1 px da borda", () => {
    const stairs: Pt[] = [];
    for (let i = 0; i < 20; i++) stairs.push([i, Math.floor(i / 3)], [i + 1, Math.floor(i / 3)]);
    const loop: Pt[] = [...stairs, [20, 10], [0, 10]];
    const s = simplifyLoop(loop, 1);
    expect(s.length).toBeLessThan(8);
    expect(s).toContainEqual([0, 10]);
  });
});

/** JPEG mínimo com EXIF: IFD0 → ExifIFD → FocalLengthIn35mmFilm. */
function jpegWithFocal(f35: number, little = true): Uint8Array {
  const tiff: number[] = [];
  const u16 = (v: number) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v: number) => (little ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0)); // IFD0 em 8, ExifIFD em 26
  tiff.push(...u16(1), ...u16(0xa405), ...u16(3), ...u32(1), ...u16(f35), 0, 0, ...u32(0));
  const app1 = [...[..."Exif"].map((c) => c.charCodeAt(0)), 0, 0, ...tiff];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xd9]);
}

describe("focal do EXIF (#169)", () => {
  test("lê a focal equivalente a 35 mm (Intel e Motorola) e converte para px", () => {
    expect(exifFocal35(jpegWithFocal(26))).toBe(26);
    expect(exifFocal35(jpegWithFocal(24, false))).toBe(24);
    // 26 mm equivalente numa foto 4032 × 3024: 26 × 5040 px / 43,27 mm ≈ 3029 px
    expect(focalPxFrom35(26, [4032, 3024])).toBeCloseTo(3029, 0);
  });

  test("sem EXIF ou arquivo que não é JPEG: null", () => {
    expect(exifFocal35(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull();
    expect(exifFocal35(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(exifFocal35(jpegWithFocal(26).subarray(0, 30))).toBeNull(); // cortado no meio
  });
});
