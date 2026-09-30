/** RGBA → imagem (data URL) para mostrar na tela; null onde não há canvas 2D (testes). */
export function toDataUrl(rgba: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): string | null {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  return c.toDataURL();
}
