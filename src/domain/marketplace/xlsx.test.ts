import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import { fillTemplate, readWorkbook, writeXlsx } from "./xlsx";

/** Modelo parecido com o da Shopee: aba de instruções, aba do modelo com linhas técnicas antes dos dados, textos em sharedStrings. */
function fakeTemplate(): Uint8Array {
  const shared = ["ps_product_name", "ps_price", "Nome do Produto*", "Preço", "Obrigatório", "Opcional", "Instruções"];
  const si = shared.map((s) => `<si><t>${s}</t></si>`).join("");
  const cell = (ref: string, i: number) => `<c r="${ref}" t="s"><v>${i}</v></c>`;
  const sheet2 = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C3"/><sheetData>
<row r="1">${cell("A1", 0)}${cell("C1", 1)}</row><row r="2">${cell("A2", 2)}<c r="B2" t="inlineStr"><is><t>Outra coluna</t></is></c>${cell("C2", 3)}</row><row r="3">${cell("A3", 4)}${cell("C3", 5)}</row>
</sheetData><dataValidations count="1"><dataValidation sqref="C4:C100" type="decimal"/></dataValidations></worksheet>`;
  const sheet1 = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cell("A1", 6)}</row></sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Instruções" sheetId="1" r:id="rId1"/><sheet name="Modelo" sheetId="2" r:id="rId2"/></sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/><Relationship Id="rId2" Target="worksheets/sheet2.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/><Relationship Id="rId3" Target="sharedStrings.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings"/></Relationships>`;
  return zipSync({
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(rels),
    "xl/worksheets/sheet1.xml": strToU8(sheet1),
    "xl/worksheets/sheet2.xml": strToU8(sheet2),
    "xl/sharedStrings.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${si}</sst>`),
    "[Content_Types].xml": strToU8("<Types/>"),
  });
}

const COLUMNS = { name: ["Nome do Produto"], price: ["Preço"], sku: ["SKU principal"] };

describe("xlsx (#78)", () => {
  test("planilha nova: lê de volta textos, números, acentos e caracteres especiais", () => {
    const bytes = writeXlsx([{ name: "Produtos", rows: [["Nome", "Preço"], ["Chaveiro <coração> & cia", 12.9], ["Ímã", null]] }]);
    const [sheet] = readWorkbook(bytes);
    expect(sheet.name).toBe("Produtos");
    expect(sheet.rows).toEqual([["Nome", "Preço"], ["Chaveiro <coração> & cia", "12.9"], ["Ímã"]]);
  });

  test("modelo baixado: acha a aba e a linha do cabeçalho pelo nome das colunas e preenche logo abaixo das linhas de instrução", () => {
    const out = fillTemplate(fakeTemplate(), COLUMNS, [
      { name: "Chaveiro", price: 12.9, sku: "CH-1" },
      { name: "Ímã & cia", price: 10, sku: "IM" },
    ]);
    expect(out).toMatchObject({ sheet: "Modelo", headerRow: 2, startRow: 4, missing: ["sku"] });
    const modelo = readWorkbook(out.bytes).find((s) => s.name === "Modelo")!;
    expect(modelo.rows[1]).toEqual(["Nome do Produto*", "Outra coluna", "Preço"]); // cabeçalho intacto
    expect(modelo.rows[2]).toEqual(["Obrigatório", "", "Opcional"]);
    expect(modelo.rows[3]).toEqual(["Chaveiro", "", "12.9"]);
    expect(modelo.rows[4]).toEqual(["Ímã & cia", "", "10"]);
    const xml = new TextDecoder().decode(unzipSync(out.bytes)["xl/worksheets/sheet2.xml"]);
    expect(xml).toContain('<dataValidation sqref="C4:C100" type="decimal"/>'); // o resto do modelo fica como estava
    expect(readWorkbook(out.bytes).map((s) => s.name)).toEqual(["Instruções", "Modelo"]);
  });

  test("arquivo que não tem as colunas esperadas: erro claro", () => {
    expect(() => fillTemplate(fakeTemplate(), { x: ["Coluna que não existe"] }, [{ x: 1 }])).toThrow(/não encontrei/i);
    expect(() => fillTemplate(strToU8("não é xlsx"), COLUMNS, [])).toThrow(/planilha/i);
  });
});
