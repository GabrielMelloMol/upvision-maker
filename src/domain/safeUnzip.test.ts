import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, test } from "vitest";
import { parse3mf } from "./slicer/threemf";
import { readWorkbook } from "./marketplace/xlsx";
import { read3mf } from "../geometry/threemfRead";
import { safeUnzip, unzipLimits, ZipTooBig } from "./safeUnzip";

const DEFAULT_TOTAL = unzipLimits.total;
afterEach(() => {
  unzipLimits.total = DEFAULT_TOTAL;
});

/** Um zip com várias entradas de zeros: pequeno compactado, grande descompactado (o jeito de uma zip bomb). */
const bomb = (names: string[], size = 4000) => zipSync(Object.fromEntries(names.map((n) => [n, new Uint8Array(size)])));

describe("zip bomb ao importar (B27)", () => {
  test("a soma do que ia descompactar passa do teto: recusa antes de descompactar, com mensagem clara", () => {
    unzipLimits.total = 10_000;
    expect(() => safeUnzip(bomb(["a", "b", "c"]))).toThrow(ZipTooBig);
    expect(() => safeUnzip(bomb(["a", "b", "c"]))).toThrow(/grande demais/);
  });

  test("dentro do teto abre normalmente, e só conta o que o filtro aceita", () => {
    unzipLimits.total = 10_000;
    const files = safeUnzip(bomb(["Metadata/a.config", "Metadata/b.config", "lixo.bin", "lixo2.bin"]), (f) => f.name.startsWith("Metadata/"));
    expect(Object.keys(files).sort()).toEqual(["Metadata/a.config", "Metadata/b.config"]); // 8 mil aceitos; os 8 mil de fora não contam
  });

  test("3MF fatiado (Metadata/*.gcode), 3MF de projeto e planilha .xlsx recusam a bomba com a mensagem de tamanho", () => {
    unzipLimits.total = 10_000;
    expect(() => parse3mf(bomb(["Metadata/a.gcode", "Metadata/b.gcode", "Metadata/c.gcode"]))).toThrow(/grande demais/);
    expect(() => read3mf(bomb(["3D/3dmodel.model", "3D/x.model", "3D/y.model"]))).toThrow(/grande demais/);
    expect(() => readWorkbook(bomb(["xl/workbook.xml", "xl/a.xml", "xl/b.xml"]))).toThrow(/grande demais/);
  });

  test("arquivos normais continuam abrindo", () => {
    const xlsx = zipSync({ "xl/workbook.xml": strToU8("<workbook/>") });
    expect(() => readWorkbook(xlsx)).not.toThrow(/grande demais/);
  });
});
