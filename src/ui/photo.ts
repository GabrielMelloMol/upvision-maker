import { suggestBrandColor } from "../domain/brandColor";

const MAX_SIDE = 1024;
const QUALITY = 0.82;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

/** Foto → JPEG até 1024 px (data URL). Mantém o banco leve e o catálogo nítido. */
export function photoToDataUrl(file: File): Promise<string> {
  return toDataUrl(file, MAX_SIDE, "image/jpeg");
}

const LOGO_SIDE = 600;

/** Logo → PNG até 600 px, mantendo a transparência. */
export function logoToDataUrl(file: File): Promise<string> {
  return toDataUrl(file, LOGO_SIDE, "image/png");
}

async function toDataUrl(file: File, maxSide: number, type: "image/jpeg" | "image/png"): Promise<string> {
  if (file.size > MAX_INPUT_BYTES) throw new Error("Foto maior que 25 MB.");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Não consegui abrir esta imagem.");
  }
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  const ctx = c.getContext("2d")!;
  if (type === "image/jpeg") {
    ctx.fillStyle = "#fff"; // PNG transparente vira fundo branco no JPEG
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL(type, QUALITY);
}

/** Cor sugerida para a marca a partir do logo (#296), lida numa miniatura de 64 px. */
export async function logoColor(dataUrl: string): Promise<string | null> {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const s = Math.min(1, 64 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * s));
  c.height = Math.max(1, Math.round(bmp.height * s));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return suggestBrandColor(ctx.getImageData(0, 0, c.width, c.height).data);
}
