import jsQR from "jsqr";

/** Texto do QR num quadro RGBA (câmera), ou null se não achou nenhum. */
export function decodeQr(rgba: Uint8ClampedArray, w: number, h: number): string | null {
  return jsQR(rgba, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
}
