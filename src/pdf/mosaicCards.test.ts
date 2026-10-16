import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { DESIGNS } from "../geometry/mosaic/designs";
import { KIT_COLORS, partsOf, countCells } from "../geometry/mosaic/grid";
import { mm } from "./doc";
import { mosaicCardsPdf } from "./mosaicCards";

const font = (n: string) => new Uint8Array(readFileSync(resolve(__dirname, "../assets/pdf-fonts", n)));
const fonts = { regular: font("Inter-Regular.ttf"), semibold: font("Inter-SemiBold.ttf"), bold: font("Inter-Bold.ttf") };
const geo = { cell: 20, piece: 17.9, pocket: 18.4 };

test("um cartão por página, em A4, com o nome, a escala 1:1 e a lista de peças", async () => {
  const cards = DESIGNS.slice(0, 3).map((d) => ({ name: d.name, grid: d.grid }));
  const { bytes, trace } = await mosaicCardsPdf(fonts, cards, KIT_COLORS, geo);
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getPage(0).getWidth()).toBeCloseTo(mm(210), 1);
  expect(trace).toContain("Borboleta");
  expect(trace).toContain("scale:1.0000");
  expect(trace.join(" ")).toMatch(/Tamanho real \(escala 1:1\)/);
  const b = DESIGNS[0];
  expect(trace.join(" ")).toContain(`Peças deste desenho: ${countCells(b.grid)}`);
  for (const p of partsOf(b.grid, KIT_COLORS)) expect(trace).toContain(String(p.n));
});

test("tabuleiro maior que a folha: reduz e diz a escala", async () => {
  const { trace } = await mosaicCardsPdf(fonts, [{ name: "Coração", grid: DESIGNS.find((d) => d.id === "heart")!.grid }], KIT_COLORS, { cell: 30, piece: 27, pocket: 28 });
  const s = Number(trace.find((t) => t.startsWith("scale:"))!.slice(6));
  expect(s).toBeLessThan(1);
  expect(trace.join(" ")).toMatch(/Reduzido a \d+%/);
});

test("sem desenhos, erro claro", async () => {
  await expect(mosaicCardsPdf(fonts, [], KIT_COLORS, geo)).rejects.toThrow(/pelo menos um desenho/);
});
