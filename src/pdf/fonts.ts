import bold from "../assets/pdf-fonts/Inter-Bold.ttf?url";
import regular from "../assets/pdf-fonts/Inter-Regular.ttf?url";
import semibold from "../assets/pdf-fonts/Inter-SemiBold.ttf?url";
import type { PdfFonts } from "./doc";

let cached: Promise<PdfFonts> | null = null;
const get = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

/** Fontes embutidas nos PDFs (Inter, OFL), carregadas uma vez. */
export function loadPdfFonts(): Promise<PdfFonts> {
  cached ??= Promise.all([get(regular), get(semibold), get(bold)]).then(([r, s, b]) => ({ regular: r, semibold: s, bold: b }));
  cached.catch(() => (cached = null));
  return cached;
}
