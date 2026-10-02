import { IMAGE_ACCEPT } from "../vectorize/client";
import type { Rgba } from "./photo";

/**
 * HEIC/HEIF (#169), o formato padrão das fotos do iPhone. O WebView2 do Windows não abre, então o app decodifica
 * sozinho com o libheif em WASM (~1,5 MB), carregado só quando chega um arquivo HEIC.
 */

/** Fotos aceitas pelo Organizador: as de sempre e HEIC/HEIF do iPhone. */
export const PHOTO_ACCEPT = `${IMAGE_ACCEPT},image/heic,image/heif,.heic,.heif`;

/** Marcas da caixa `ftyp` de HEIF com HEVC (iPhone: heic + mif1). */
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "mif2"]);
/** AVIF também usa mif1, mas é AV1: o WebView já abre e o libheif daqui não traz o decodificador. */
const AV1_BRANDS = new Set(["avif", "avis"]);

export const HEIF_ERROR = "Não consegui abrir esta foto HEIC. No iPhone, exporte como JPEG (Ajustes → Câmera → Formatos → Mais Compatível) ou abra no Fotos do Mac e use Arquivo → Exportar como JPEG.";

const ascii = (b: Uint8Array, from: number) => String.fromCharCode(b[from], b[from + 1], b[from + 2], b[from + 3]);

/** É HEIC/HEIF pelo conteúdo (marcas da caixa `ftyp` no começo do arquivo), não pela extensão. */
export function isHeif(head: Uint8Array): boolean {
  if (head.length < 16 || ascii(head, 4) !== "ftyp") return false;
  const size = Math.min(((head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3]) >>> 0, head.length);
  const brands = [ascii(head, 8)];
  for (let i = 16; i + 4 <= size; i += 4) brands.push(ascii(head, i));
  return brands.some((b) => HEIF_BRANDS.has(b)) && !brands.some((b) => AV1_BRANDS.has(b));
}

type HeifImage = {
  is_primary(): boolean;
  get_width(): number;
  get_height(): number;
  display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (r: unknown) => void): void;
  free(): void;
};
type Decoder = { decoder: number | null; decode(bytes: Uint8Array): HeifImage[] };
export type LibHeif = { HeifDecoder: new () => Decoder; heif_context_free(ctx: number): void };
type Factory = (opts: { wasmBinary: ArrayBuffer; onRuntimeInitialized: () => void; onAbort: (why: unknown) => void }) => LibHeif;

/** Sobe o libheif com o binário WASM já em memória e espera ele ficar pronto. */
export function startLibheif(factory: Factory, wasmBinary: ArrayBuffer): Promise<LibHeif> {
  return new Promise((resolve, reject) => {
    const mod: { lib?: LibHeif } = {};
    mod.lib = factory({
      wasmBinary,
      // o Emscripten chama isto quando o módulo termina de subir (pode ser antes do factory retornar)
      onRuntimeInitialized: () => queueMicrotask(() => resolve(mod.lib!)),
      onAbort: (why) => reject(new Error(String(why))),
    });
  });
}

let loading: Promise<LibHeif> | null = null;

function libheif(): Promise<LibHeif> {
  loading ??= (async () => {
    const [js, wasm] = await Promise.all([import("libheif-js/libheif-wasm/libheif.js"), import("libheif-js/libheif-wasm/libheif.wasm?url")]);
    const binary = await (await fetch(wasm.default)).arrayBuffer();
    return startLibheif(js.default as unknown as Factory, binary);
  })();
  loading.catch(() => (loading = null)); // falhou: tenta de novo no próximo arquivo
  return loading;
}

/** Pixels RGBA da imagem primária, já girada pelo próprio HEIF (o iPhone grava a rotação no arquivo). */
export async function decodeHeif(bytes: Uint8Array, lib?: LibHeif): Promise<Rgba & { data: Uint8ClampedArray<ArrayBuffer> }> {
  const heif = lib ?? (await libheif());
  const decoder = new heif.HeifDecoder();
  let images: HeifImage[] = [];
  try {
    images = decoder.decode(bytes);
    const main = images.find((i) => i.is_primary()) ?? images[0];
    if (!main) throw new Error(HEIF_ERROR);
    const width = main.get_width();
    const height = main.get_height();
    const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
    await new Promise<void>((resolve, reject) => main.display(target, (r) => (r ? resolve() : reject(new Error(HEIF_ERROR)))));
    return target;
  } catch {
    throw new Error(HEIF_ERROR);
  } finally {
    images.forEach((i) => i.free());
    if (decoder.decoder) heif.heif_context_free(decoder.decoder); // solta a memória do WASM
  }
}

/** Focal equivalente a 35 mm do EXIF de dentro do HEIC (o exifr acha o item Exif nas caixas do arquivo). */
export async function heifFocal35(bytes: Uint8Array): Promise<number | null> {
  try {
    const { default: exifr } = await import("exifr/dist/lite.esm.mjs");
    const tags = (await exifr.parse(bytes)) as { FocalLengthIn35mmFormat?: number } | undefined;
    const f = tags?.FocalLengthIn35mmFormat;
    return typeof f === "number" && f > 0 ? f : null;
  } catch {
    return null; // sem EXIF: a tela pede a régua
  }
}
