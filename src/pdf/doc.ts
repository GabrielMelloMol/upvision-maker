import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

export type PdfFonts = { regular: Uint8Array; semibold: Uint8Array; bold: Uint8Array };

export const A4 = { w: 595.28, h: 841.89 };
export const MARGIN = 42;
export const mm = (v: number) => (v * 72) / 25.4;

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
export const COLOR = { text: hex("#111827"), muted: hex("#6B7280"), line: hex("#E5E7EB"), accent: hex("#2563EB"), soft: hex("#F3F4F6"), white: rgb(1, 1, 1) };

type TextOpts = { size?: number; font?: "regular" | "semibold" | "bold"; color?: RGB; x?: number; width?: number; align?: "left" | "right" | "center"; lineGap?: number };
export type Column = { title: string; width: number; align?: "left" | "right" };

/**
 * Montador de PDF A4 com cursor vertical: texto com quebra de linha, tabelas que continuam na página seguinte,
 * imagens e QR vetorial. `trace` guarda o texto desenhado (os testes conferem o conteúdo por ele).
 */
export class Pdf {
  page!: PDFPage;
  y = 0;
  readonly trace: string[] = [];
  private constructor(
    readonly doc: PDFDocument,
    readonly fonts: Record<"regular" | "semibold" | "bold", PDFFont>,
    private readonly onNewPage?: (pdf: Pdf) => void,
  ) {}

  static async create(fonts: PdfFonts, title: string, onNewPage?: (pdf: Pdf) => void): Promise<Pdf> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    doc.setTitle(title);
    doc.setProducer("UpVision Maker");
    doc.setCreator("UpVision Maker");
    const f = { regular: await doc.embedFont(fonts.regular, { subset: true }), semibold: await doc.embedFont(fonts.semibold, { subset: true }), bold: await doc.embedFont(fonts.bold, { subset: true }) };
    const pdf = new Pdf(doc, f, onNewPage);
    pdf.addPage();
    return pdf;
  }

  get width() {
    return A4.w - 2 * MARGIN;
  }

  addPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.y = A4.h - MARGIN;
    this.onNewPage?.(this);
  }

  /** Garante espaço vertical; se não couber, vai para a próxima página. */
  ensure(h: number) {
    if (this.y - h < MARGIN + 18) this.addPage();
  }

  wrap(text: string, size: number, font: PDFFont, width: number): string[] {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
        else {
          out.push(line);
          line = word;
        }
      }
      out.push(line);
    }
    return out;
  }

  /** Escreve texto (com quebra) a partir do cursor e desce o cursor. Retorna a altura usada. */
  text(str: string, o: TextOpts = {}): number {
    const size = o.size ?? 10;
    const font = this.fonts[o.font ?? "regular"];
    const x = o.x ?? MARGIN;
    const width = o.width ?? A4.w - MARGIN - x;
    const lh = size * (1.35 + (o.lineGap ?? 0));
    const lines = this.wrap(str, size, font, width);
    for (const l of lines) {
      this.ensure(lh);
      const w = font.widthOfTextAtSize(l, size);
      const dx = o.align === "right" ? width - w : o.align === "center" ? (width - w) / 2 : 0;
      this.page.drawText(l, { x: x + dx, y: this.y - size, size, font, color: o.color ?? COLOR.text });
      this.trace.push(l);
      this.y -= lh;
    }
    return lines.length * lh;
  }

  /** Texto numa posição fixa, sem mexer no cursor. */
  at(str: string, x: number, y: number, o: TextOpts = {}) {
    const size = o.size ?? 10;
    const font = this.fonts[o.font ?? "regular"];
    const w = font.widthOfTextAtSize(str, size);
    const dx = o.align === "right" ? -w : o.align === "center" ? -w / 2 : 0;
    this.page.drawText(str, { x: x + dx, y, size, font, color: o.color ?? COLOR.text });
    this.trace.push(str);
  }

  gap(h: number) {
    this.y -= h;
  }

  /** Retângulo de cantos arredondados; (x, top) é o canto superior esquerdo. */
  roundRect(x: number, top: number, w: number, h: number, r: number, color: RGB) {
    const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    this.page.drawSvgPath(path, { x, y: top, color, borderWidth: 0 });
  }

  rule(color = COLOR.line) {
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: A4.w - MARGIN, y: this.y }, thickness: 0.8, color });
  }

  /** Tabela: cabeçalho repetido em cada página, linhas com quebra de texto. */
  table(columns: Column[], rows: string[][], size = 9.5) {
    const pad = 6;
    const header = () => {
      this.ensure(22);
      this.page.drawRectangle({ x: MARGIN, y: this.y - 20, width: this.width, height: 20, color: COLOR.soft });
      let x = MARGIN;
      for (const c of columns) {
        this.at(c.title, c.align === "right" ? x + c.width - pad : x + pad, this.y - 14, { size: 8.5, font: "semibold", color: COLOR.muted, align: c.align });
        x += c.width;
      }
      this.y -= 20;
    };
    header();
    for (const row of rows) {
      const cells = row.map((cell, i) => this.wrap(cell, size, this.fonts.regular, columns[i].width - 2 * pad));
      const h = Math.max(...cells.map((c) => c.length)) * size * 1.35 + 2 * pad - 2;
      if (this.y - h < MARGIN + 18) {
        this.addPage();
        header();
      }
      let x = MARGIN;
      cells.forEach((lines, i) => {
        const c = columns[i];
        lines.forEach((l, k) => this.at(l, c.align === "right" ? x + c.width - pad : x + pad, this.y - pad - size - k * size * 1.35 + 2, { size, align: c.align }));
        x += c.width;
      });
      this.y -= h;
      this.rule();
    }
  }

  async image(dataUrl: string): Promise<PDFImage> {
    const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
    return dataUrl.startsWith("data:image/png") ? this.doc.embedPng(bytes) : this.doc.embedJpg(bytes);
  }

  /** Imagem encaixada (contain) numa caixa com canto inferior esquerdo em (x, y). */
  drawContain(img: PDFImage, x: number, y: number, w: number, h: number) {
    const s = Math.min(w / img.width, h / img.height);
    this.page.drawImage(img, { x: x + (w - img.width * s) / 2, y: y + (h - img.height * s) / 2, width: img.width * s, height: img.height * s });
  }

  /** QR vetorial (módulos como retângulos) com fundo branco e zona de silêncio. */
  qr(matrix: boolean[][], x: number, y: number, size: number, quiet = 4) {
    const n = matrix.length + 2 * quiet;
    const m = size / n;
    this.page.drawRectangle({ x, y, width: size, height: size, color: COLOR.white });
    matrix.forEach((row, r) =>
      row.forEach((on, c) => {
        if (on) this.page.drawRectangle({ x: x + (c + quiet) * m, y: y + size - (r + quiet + 1) * m, width: m + 0.02, height: m + 0.02, color: rgb(0, 0, 0) });
      }),
    );
  }

  /** Numera as páginas ("1 / 3") e devolve o arquivo. */
  async save(footer?: string): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const label = `${i + 1} / ${pages.length}`;
      const f = this.fonts.regular;
      p.drawText(label, { x: A4.w - MARGIN - f.widthOfTextAtSize(label, 8), y: 22, size: 8, font: f, color: COLOR.muted });
      if (footer) p.drawText(footer, { x: MARGIN, y: 22, size: 8, font: f, color: COLOR.muted });
    });
    return this.doc.save();
  }
}

export const moneyBr = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dateBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
