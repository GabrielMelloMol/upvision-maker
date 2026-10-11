/** Máscara (1 = figura) de um SVG, desenhado num canvas com o lado maior em `size` px. SVG sem transparência usa o escuro como figura. */
export type SvgMask = { mask: Uint8Array; w: number; h: number; url: string };

const MASK_SIZE = 240;
const ALPHA_ON = 40;
const LUMA_ON = 200;

const load = (src: string) =>
  new Promise<HTMLImageElement>((ok, no) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => no(new Error("Não consegui desenhar a imagem."));
    img.src = src;
  });

export async function svgToMask(svg: string, size = MASK_SIZE): Promise<SvgMask> {
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = await load(blobUrl);
    const k = size / Math.max(img.naturalWidth || size, img.naturalHeight || size);
    const w = Math.max(1, Math.round((img.naturalWidth || size) * k)), h = Math.max(1, Math.round((img.naturalHeight || size) * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Sem canvas para analisar a imagem.");
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    let hasAlpha = false;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 250) hasAlpha = true;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) {
      const [r, g, b, a] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]];
      mask[i] = (hasAlpha ? a > ALPHA_ON : 0.2126 * r + 0.7152 * g + 0.0722 * b < LUMA_ON) ? 1 : 0;
    }
    // o que o app entendeu, desenhado: figura escura sobre fundo claro
    const out = ctx.createImageData(w, h);
    for (let i = 0; i < mask.length; i++) out.data.set(mask[i] ? [29, 29, 31, 255] : [246, 245, 241, 255], i * 4);
    ctx.putImageData(out, 0, 0);
    return { mask, w, h, url: canvas.toDataURL("image/png") };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
