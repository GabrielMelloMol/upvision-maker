import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { ALL_COUPONS, COUPONS, DEFAULT_INPUTS, type KitSelection } from "../geometry/testKit/catalog";
import type { PdfFonts } from "./doc";
import { testKitPdf } from "./testKitSheet";

const font = (n: string) => new Uint8Array(readFileSync(resolve(__dirname, "../assets/pdf-fonts", n)));
const fonts: PdfFonts = { regular: font("Inter-Regular.ttf"), semibold: font("Inter-SemiBold.ttf"), bold: font("Inter-Bold.ttf") };
const text = (trace: string[]) => trace.join("\n").replace(/\u00a0/g, "\u0020");

test("folha completa: uma seção por peça, a folga de cada número, o padrão de hoje e onde lançar no app", async () => {
  const { bytes, trace } = await testKitPdf(fonts, ALL_COUPONS, DEFAULT_INPUTS, "2026-10-16");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(3);
  const t = text(trace);
  for (const c of COUPONS) {
    expect(t, c.title).toContain(c.title);
    expect(t, c.fitLabel).toContain(`Ajustes › Kit de testes › ${c.fitLabel}`);
  }
  expect(t).toContain("(padrão de hoje)");
  expect(t).toContain("diâmetro de 75,0 mm na altura da alça");
  expect(t).toContain("60,0 × 40,0 mm (comprimento × largura)");
  expect(t).toContain("SUA impressora");
});

test("só os cupons marcados entram na folha", async () => {
  const only: KitSelection = { ...Object.fromEntries(COUPONS.map((c) => [c.id, false])), hinge: true } as KitSelection;
  const t = text((await testKitPdf(fonts, only, DEFAULT_INPUTS, "2026-10-16")).trace);
  expect(t).toContain("Dobradiça impressa montada");
  expect(t).not.toContain("Anel do copo");
  expect(t).not.toContain("Medidas usadas neste kit");
});

test("com as mesas, a folha lista o filamento e as peças de cada uma", async () => {
  const plates = [{ title: "Mesa 1 · PLA ou PETG", names: ["Anel 1 (folga 0,20)", "Anel 2 (folga 0,35)"] }, { title: "Mesa 2 · TPU 95A", names: ["Canto 1 (folga 0,00)"] }];
  const t = text((await testKitPdf(fonts, ALL_COUPONS, DEFAULT_INPUTS, "2026-10-16", plates)).trace);
  expect(t).toContain("Mesas e filamentos");
  expect(t).toContain("Mesa 2 · TPU 95A");
  expect(t).toContain("Canto 1 (folga 0,00)");
});
