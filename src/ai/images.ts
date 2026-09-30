import type Anthropic from "@anthropic-ai/sdk";

/** Imagem de referência pronta para mandar ao Claude (#89): já reduzida e comprimida, em base64. */
export type RefImage = {
  id: string;
  name: string;
  mediaType: "image/jpeg" | "image/png";
  data: string; // base64, sem o prefixo data:
  width: number;
  height: number;
  caption: string;
};

export const MAX_IMAGES = 5; // por mensagem
export const MAX_SIDE_PX = 1568; // lado maior: detalhe suficiente para forma e medida, custo menor
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif";
const JPEG_QUALITY = 0.85;
const HEIC = /\.(heic|heif)$/i;

/** Tamanho final mantendo a proporção, com o lado maior em no máximo `max`. */
export function fitSize(w: number, h: number, max = MAX_SIDE_PX): [number, number] {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

let seq = 0;
const newId = () => `img${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Lê a imagem, reduz para o lado maior de 1568 px e comprime: JPEG para fotos, PNG para desenho com transparência
 * (esboço). Tudo no próprio computador; só sai no pedido para a Anthropic.
 */
export async function prepareImage(file: Blob & { name?: string }, opts: { png?: boolean } = {}): Promise<RefImage> {
  const name = file.name ?? "imagem";
  const okType = /^image\/(png|jpeg|webp|heic|heif)$/.test(file.type) || HEIC.test(name);
  if (!okType) throw new Error(`"${name}" não é uma imagem PNG, JPG, WebP ou HEIC.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`"${name}" tem mais de 25 MB.`);
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(HEIC.test(name) || /hei[cf]/.test(file.type) ? `Este computador não abre HEIC ("${name}"): exporte a foto como JPG.` : `Não consegui abrir "${name}".`);
  }
  const [w, h] = fitSize(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Sem suporte a canvas para preparar a imagem.");
  if (!opts.png) {
    // JPEG não tem transparência: fundo branco em vez de preto
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
  }
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const mediaType = opts.png ? "image/png" : "image/jpeg";
  const url = canvas.toDataURL(mediaType, JPEG_QUALITY);
  return { id: newId(), name, mediaType, data: url.slice(url.indexOf(",") + 1), width: w, height: h, caption: "" };
}

/** URL para miniatura na tela. */
export const imageUrl = (i: RefImage) => `data:${i.mediaType};base64,${i.data}`;

/**
 * Conteúdo da mensagem do usuário: cada imagem vem antes do texto (como recomenda a API), com a legenda dela como
 * "Imagem N: …" para o Claude saber qual é qual.
 */
export function userContent(text: string, images: RefImage[]): string | Anthropic.ContentBlockParam[] {
  if (!images.length) return text;
  const blocks: Anthropic.ContentBlockParam[] = [];
  images.forEach((img, i) => {
    blocks.push({ type: "text", text: `Imagem ${i + 1}${img.caption.trim() ? `: ${img.caption.trim()}` : ""}` });
    blocks.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
  });
  blocks.push({ type: "text", text });
  return blocks;
}
