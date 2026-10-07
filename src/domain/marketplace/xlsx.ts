import { strFromU8, strToU8, zipSync } from "fflate";
import { safeUnzip, ZipTooBig } from "../safeUnzip";

/**
 * XLSX mínimo, sem dependência nova (#78): escrever uma planilha simples e preencher um modelo baixado do marketplace
 * sem mexer no resto dele (abas, validações, estilos). Só o necessário para planilhas de upload em massa.
 */
export type Cell = string | number | null | undefined;

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Coluna 0 → "A", 26 → "AA". */
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const colIndex = (ref: string) => [...ref.replace(/\d+$/, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function cellXml(ref: string, v: Cell): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

/** Planilha nova (uma aba por item). */
export function writeXlsx(sheets: { name: string; rows: Cell[][] }[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  sheets.forEach((s, i) => {
    const rows = s.rows.map((r, j) => `<row r="${j + 1}">${r.map((v, c) => cellXml(`${colName(c)}${j + 1}`, v)).join("")}</row>`).join("");
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${MAIN}"><sheetData>${rows}</sheetData></worksheet>`);
  });
  const ids = sheets.map((_, i) => i + 1);
  files["xl/workbook.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
  );
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${ids.map((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join("")}</Relationships>`,
  );
  files["_rels/.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  files["[Content_Types].xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${ids.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
  );
  return zipSync(files);
}

type Book = { files: Record<string, Uint8Array>; sheets: { name: string; path: string }[]; shared: string[] };

function openBook(bytes: Uint8Array): Book {
  let files: Record<string, Uint8Array>;
  try {
    files = safeUnzip(bytes);
  } catch (e) {
    throw e instanceof ZipTooBig ? e : new Error("Este arquivo não é uma planilha .xlsx.");
  }
  const wb = files["xl/workbook.xml"];
  if (!wb) throw new Error("Este arquivo não é uma planilha .xlsx.");
  const rels = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const sheets = [...strFromU8(wb).matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const t = target.get(attr(m[0], "r:id")) ?? "";
    return { name: unesc(attr(m[0], "name")), path: t.startsWith("/") ? t.slice(1) : `xl/${t}` };
  });
  const sst = files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "";
  const shared = [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  return { files, sheets, shared };
}

function attr(tag: string, name: string): string {
  return new RegExp(`\\s${name.replace(":", "\\:")}="([^"]*)"`).exec(tag)?.[1] ?? "";
}

type Row = { attrs: string; cells: Map<number, string> };

/** Linhas da aba: número da linha → atributos e células (xml bruto por coluna). */
function parseRows(xml: string): Map<number, Row> {
  const rows = new Map<number, Row>();
  for (const m of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(m[0], "r"));
    const cells = new Map<number, string>();
    for (const c of (m[2] ?? "").matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) cells.set(colIndex(attr(c[0], "r")), c[0]);
    rows.set(r, { attrs: m[1].replace(/\sspans="[^"]*"/, ""), cells }); // spans fica errado ao somar células
  }
  return rows;
}

function cellText(xml: string, shared: string[]): string {
  const type = attr(xml.slice(0, xml.indexOf(">")), "t");
  if (type === "s") return shared[Number(/<v>([\s\S]*?)<\/v>/.exec(xml)?.[1])] ?? "";
  if (type === "inlineStr") return unesc([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
  return unesc(/<v>([\s\S]*?)<\/v>/.exec(xml)?.[1] ?? "");
}

function grid(rows: Map<number, Row>, shared: string[]): string[][] {
  const out: string[][] = [];
  for (const [r, row] of [...rows].sort((a, b) => a[0] - b[0])) {
    const line: string[] = [];
    for (const [c, xml] of row.cells) line[c] = cellText(xml, shared);
    out[r - 1] = Array.from(line, (v) => v ?? "");
  }
  return Array.from(out, (l) => l ?? []);
}

/** Todas as abas como texto (para testes e para mostrar o que foi lido). */
export function readWorkbook(bytes: Uint8Array): { name: string; rows: string[][] }[] {
  const book = openBook(bytes);
  return book.sheets.map((s) => ({ name: s.name, rows: grid(parseRows(strFromU8(book.files[s.path] ?? new Uint8Array())), book.shared) }));
}

/** Rótulo comparável: sem acento, minúsculo, sem "*", sem o que vem depois de ":" ou "(". */
export const normLabel = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[:(].*$/s, "").replace(/\*/g, "").replace(/\s+/g, " ").trim();

export type FillResult = { bytes: Uint8Array; sheet: string; headerRow: number; startRow: number; missing: string[] };

/**
 * Preenche o modelo baixado do marketplace: acha a aba e a linha de cabeçalho com mais colunas conhecidas
 * (`columns`: chave → rótulos aceitos), começa na primeira linha abaixo dela com a primeira coluna vazia
 * (pula as linhas de "Obrigatório"/instruções) e escreve só nas colunas mapeadas.
 */
export function fillTemplate(bytes: Uint8Array, columns: Record<string, string[]>, data: Record<string, Cell>[]): FillResult {
  const book = openBook(bytes);
  const wanted = Object.entries(columns).map(([key, labels]) => ({ key, labels: new Set(labels.map(normLabel)) }));
  let best: { sheet: (typeof book.sheets)[number]; rows: Map<number, Row>; header: number; cols: Map<string, number> } | null = null;
  for (const sheet of book.sheets) {
    const rows = parseRows(strFromU8(book.files[sheet.path] ?? new Uint8Array()));
    for (const [r, row] of rows) {
      const cols = new Map<string, number>();
      for (const [c, xml] of row.cells) {
        const label = normLabel(cellText(xml, book.shared));
        const hit = wanted.find((w) => w.labels.has(label) && !cols.has(w.key));
        if (hit) cols.set(hit.key, c);
      }
      if (cols.size && (!best || cols.size > best.cols.size)) best = { sheet, rows, header: r, cols };
    }
  }
  if (!best) throw new Error("Não encontrei as colunas do modelo nesta planilha. Baixe o modelo de upload em massa de novo no marketplace.");
  const { sheet, rows, header, cols } = best;
  const firstCol = cols.get(wanted.find((w) => cols.has(w.key))!.key)!;
  let start = header + 1;
  while (rows.get(start)?.cells.get(firstCol) && cellText(rows.get(start)!.cells.get(firstCol)!, book.shared).trim()) start++;
  data.forEach((values, i) => {
    const r = start + i;
    const row = rows.get(r) ?? { attrs: ` r="${r}"`, cells: new Map<number, string>() };
    for (const [key, c] of cols) {
      const xml = cellXml(`${colName(c)}${r}`, values[key]);
      if (xml) row.cells.set(c, xml);
      else row.cells.delete(c);
    }
    rows.set(r, row);
  });
  const sheetXml = strFromU8(book.files[sheet.path]);
  const body = [...rows]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => `<row${row.attrs}>${[...row.cells].sort((a, b) => a[0] - b[0]).map(([, x]) => x).join("")}</row>`)
    .join("");
  const updated = sheetXml.replace(/<sheetData\b[^>]*?(?:\/>|>[\s\S]*?<\/sheetData>)/, `<sheetData>${body}</sheetData>`).replace(/<dimension\b[^>]*\/>/, "");
  return {
    bytes: zipSync({ ...book.files, [sheet.path]: strToU8(updated) }),
    sheet: sheet.name,
    headerRow: header,
    startRow: start,
    missing: wanted.filter((w) => !cols.has(w.key)).map((w) => w.key),
  };
}
