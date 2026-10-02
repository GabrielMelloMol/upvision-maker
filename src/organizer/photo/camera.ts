import type { Mat3, Pt } from "./homography";

/** Onde estava a câmera em relação à folha: ponto da folha bem embaixo dela, altura e inclinação. */
export type Camera = { nadir: Pt; distanceMm: number; tiltDeg: number };

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Pose da câmera a partir da homografia folha (mm) → foto (px) e da distância focal em px (centro óptico no meio da
 * foto). K⁻¹·H = λ·[r1 r2 t]; a câmera fica em −Rᵀt. null se a conta não fechar (focal absurda).
 */
export function cameraFromHomography(h: Mat3, focalPx: number, size: [number, number]): Camera | null {
  const [cx, cy] = [size[0] / 2, size[1] / 2];
  const col = (j: number): V3 => [(h[j] - cx * h[6 + j]) / focalPx, (h[3 + j] - cy * h[6 + j]) / focalPx, h[6 + j]];
  const c1 = col(0);
  const c2 = col(1);
  const c3 = col(2);
  const lambda = 2 / (Math.hypot(...c1) + Math.hypot(...c2));
  if (!Number.isFinite(lambda)) return null;
  const sign = c3[2] * lambda < 0 ? -1 : 1; // a folha fica na frente da câmera
  const r1 = c1.map((v) => v * lambda * sign) as V3;
  const r2 = c2.map((v) => v * lambda * sign) as V3;
  const t = c3.map((v) => v * lambda * sign) as V3;
  const n: V3 = [r1[1] * r2[2] - r1[2] * r2[1], r1[2] * r2[0] - r1[0] * r2[2], r1[0] * r2[1] - r1[1] * r2[0]];
  const len = Math.hypot(...n);
  const r3 = n.map((v) => v / len) as V3;
  const distanceMm = Math.abs(dot(r3, t));
  if (!(distanceMm > 0)) return null;
  return { nadir: [-dot(r1, t), -dot(r2, t)], distanceMm, tiltDeg: (Math.acos(Math.min(1, Math.abs(r3[2]))) * 180) / Math.PI };
}

/**
 * Paralaxe numa ferramenta deitada de paredes retas e altura h, direto na máscara (`pxPerMm` px por mm, y para
 * baixo). Vista de cima, a silhueta S é a base F mais o topo empurrado para longe do ponto embaixo da câmera
 * (fator D/(D − h), semelhança de triângulos). Encolhendo S por (D − h)/D em direção a esse ponto, o topo volta
 * para cima de F e a sobra cai para dentro; a interseção das duas é F (exata numa linha, inclusive com furos, e
 * muito perto disso no plano). Pixel p fica se p e o ponto p ampliado (onde ele estaria antes de encolher) são
 * ferramenta.
 */
export function unParallaxMask(mask: Uint8Array, w: number, h: number, cam: Camera, heightMm: number, pxPerMm: number): Uint8Array {
  const grow = cam.distanceMm / (cam.distanceMm - heightMm);
  const cx = cam.nadir[0] * pxPerMm;
  const cy = cam.nadir[1] * pxPerMm;
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const qx = Math.floor(cx + (x + 0.5 - cx) * grow);
      const qy = Math.floor(cy + (y + 0.5 - cy) * grow);
      if (qx >= 0 && qy >= 0 && qx < w && qy < h && mask[qy * w + qx]) out[y * w + x] = 1;
    }
  return out;
}

/** Diagonal do filme 35 mm (36 × 24 mm), base da "focal equivalente" do EXIF. */
const FULL_FRAME_DIAGONAL = Math.hypot(36, 24);

/** Focal em px a partir da focal equivalente a 35 mm e do tamanho da foto (vale em pé ou deitada). */
export const focalPxFrom35 = (focal35: number, size: [number, number]) => (focal35 * Math.hypot(size[0], size[1])) / FULL_FRAME_DIAGONAL;

/**
 * Focal equivalente a 35 mm (tag EXIF 0xA405) de um JPEG; null se a foto não tiver (print de tela, foto editada,
 * PNG). Lê só o bloco APP1 do começo do arquivo.
 */
export function exifFocal35(bytes: Uint8Array): number | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    const size = view.getUint16(at + 2);
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === "Exif") return tiffFocal35(view, at + 10);
    if (marker === 0xda) return null; // começou a imagem: não há EXIF antes
    at += 2 + size;
  }
  return null;
}

function tiffFocal35(view: DataView, tiff: number): number | null {
  try {
    const little = view.getUint16(tiff) === 0x4949;
    const u16 = (o: number) => view.getUint16(tiff + o, little);
    const u32 = (o: number) => view.getUint32(tiff + o, little);
    const find = (ifd: number, tag: number): number | null => {
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (u16(e) === tag) return u16(e + 2) === 3 ? u16(e + 8) : u32(e + 8); // SHORT inline ou LONG/offset
      }
      return null;
    };
    const exif = find(u32(4), 0x8769);
    if (exif === null) return null;
    const f = find(exif, 0xa405);
    return f && f > 0 ? f : null;
  } catch {
    return null; // EXIF truncado: segue sem focal
  }
}
