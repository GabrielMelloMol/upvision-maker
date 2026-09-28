import { expect, test } from "vitest";
import { qrMatrix } from "../domain/qr";
import { filamentQr, parseFilamentQr } from "../domain/spoolQr";
import { decodeQr } from "./qrDecode";

/** QR da etiqueta desenhado como a câmera veria: 6 px por módulo, margem de 2 módulos (a da etiqueta). */
function render(text: string, px = 6, quiet = 2) {
  const m = qrMatrix(text);
  const n = (m.length + 2 * quiet) * px;
  const rgba = new Uint8ClampedArray(n * n * 4).fill(255);
  m.forEach((row, r) =>
    row.forEach((on, c) => {
      if (!on) return;
      for (let y = 0; y < px; y++)
        for (let x = 0; x < px; x++) {
          const i = (((r + quiet) * px + y) * n + (c + quiet) * px + x) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
    }),
  );
  return { rgba, n };
}

test("o QR da etiqueta (margem de 2 módulos) é lido e volta para o id do filamento", () => {
  const { rgba, n } = render(filamentQr(42));
  expect(parseFilamentQr(decodeQr(rgba, n, n)!)).toBe(42);
});

test("quadro sem QR: null", () => {
  expect(decodeQr(new Uint8ClampedArray(40 * 40 * 4).fill(200), 40, 40)).toBeNull();
});
