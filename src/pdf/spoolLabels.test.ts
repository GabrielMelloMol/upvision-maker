import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { mm, type PdfFonts } from "./doc";
import { spoolLabelsPdf, type SpoolLabel } from "./spoolLabels";

const font = (n: string) => new Uint8Array(readFileSync(resolve(__dirname, "../assets/pdf-fonts", n)));
const fonts: PdfFonts = { regular: font("Inter-Regular.ttf"), semibold: font("Inter-SemiBold.ttf"), bold: font("Inter-Bold.ttf") };
const labels = (n: number): SpoolLabel[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `PLA Azul ${i + 1}`, subtitle: "Voolt", detail: "Rolo de 1 kg", }));

test("etiquetadora: uma página de 50 × 30 mm por rolo, com nome e #id", async () => {
  const { bytes, trace } = await spoolLabelsPdf(fonts, labels(3), "roll");
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(3);
  const { width, height } = doc.getPage(0).getSize();
  expect([width, height]).toEqual([expect.closeTo(mm(50), 2), expect.closeTo(mm(30), 2)]);
  expect(trace).toEqual(expect.arrayContaining(["PLA Azul 1", "Voolt", "Rolo de 1 kg", "#1", "#3"]));
});

test("folha A4: 24 por página (3 × 8); nome comprido é cortado com reticências", async () => {
  const long = [{ id: 9, title: "PETG Translúcido Azul-petróleo Metalizado Premium", subtitle: "", detail: "" }];
  const { bytes, trace } = await spoolLabelsPdf(fonts, [...labels(25), ...long], "a4");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  expect(trace.find((t) => t.startsWith("PETG"))).toMatch(/…$/);
});

test("sem rolos: erro claro", async () => {
  await expect(spoolLabelsPdf(fonts, [], "a4")).rejects.toThrow(/pelo menos um/);
});
