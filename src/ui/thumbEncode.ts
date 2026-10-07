/**
 * Miniatura em WebP; se o navegador não codifica WebP (o WebKit do Mac devolve PNG em silêncio, bem maior),
 * refaz em JPEG sobre `background`, já que JPEG não tem transparência (B22). O canvas original não muda.
 */
export function encodeThumb(canvas: HTMLCanvasElement, quality: number, background: string): string {
  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  const flat = document.createElement("canvas");
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext("2d");
  if (!ctx) return webp;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return flat.toDataURL("image/jpeg", quality);
}
