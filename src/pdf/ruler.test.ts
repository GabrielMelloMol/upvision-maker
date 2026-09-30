import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { mm } from "./doc";
import { rulerPdf, rulerTicks } from "./ruler";

const font = (n: string) => new Uint8Array(readFileSync(resolve(__dirname, "../assets/pdf-fonts", n)));

test("marcas da régua: mm curto, 5 mm médio, cm longo com número", () => {
  const t = rulerTicks(250);
  expect(t).toHaveLength(251);
  expect(t[0]).toEqual({ mm: 0, kind: "cm", label: "0" });
  expect(t[5].kind).toBe("half");
  expect(t[7].kind).toBe("mm");
  expect(t[250]).toEqual({ mm: 250, kind: "cm", label: "25" });
});

test("PDF da régua: A4 em escala 1:1 (réguas de 25 e 20 cm, cartão de 85,6 × 54 mm) e aviso de 100% (#140)", async () => {
  const fonts = { regular: font("Inter-Regular.ttf"), semibold: font("Inter-SemiBold.ttf"), bold: font("Inter-Bold.ttf") };
  const { bytes, trace } = await rulerPdf(fonts);
  const doc = await PDFDocument.load(bytes);
  const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
  expect(w).toBeCloseTo(mm(210), 1);
  expect(h).toBeCloseTo(mm(297), 1);
  expect(trace.join(" ")).toMatch(/tamanho real|100%/i);
  // medidas desenhadas, em pontos: 25 cm, 20 cm e o cartão
  expect(trace).toContain(`ruler:${mm(250).toFixed(2)}`);
  expect(trace).toContain(`ruler:${mm(200).toFixed(2)}`);
  expect(trace).toContain(`card:${mm(85.6).toFixed(2)}x${mm(54).toFixed(2)}`);
});
