import { PDFDocument } from "pdf-lib";
import { describe, expect, test } from "vitest";
import { measureSheetPdf } from "./measureSheetPdf";

const PT_PER_MM = 72 / 25.4;

describe("folha de medição em PDF (#169)", () => {
  test("uma página do tamanho exato do papel, em pé (A4 210 × 297 mm, Carta 215,9 × 279,4 mm)", async () => {
    for (const [sheet, w, h] of [[{ widthMm: 210, heightMm: 297 }, 210, 297], [{ widthMm: 279.4, heightMm: 215.9 }, 215.9, 279.4]] as const) {
      const doc = await PDFDocument.load(await measureSheetPdf(sheet, "teste"));
      expect(doc.getPageCount()).toBe(1);
      const { width, height } = doc.getPage(0).getSize();
      expect(width / PT_PER_MM).toBeCloseTo(w, 1);
      expect(height / PT_PER_MM).toBeCloseTo(h, 1);
    }
  });
});
