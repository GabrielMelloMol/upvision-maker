import { zlibSync } from "fflate";
import type { Model } from "../../types";
import type { Raster } from "./images";

/*
 * Painel visual da bateria: um renderizador por software (sem navegador) que desenha o cartão visto de cima e o modelo montado em
 * perspectiva paralela, com z-buffer e luz simples, e grava PNG. Só para teste/aprovação, não faz parte do app.
 */
export type Img = { w: number; h: number; px: Uint8ClampedArray };
type Rgb = [number, number, number];

export const newImg = (w: number, h: number, bg: Rgb): Img => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([bg[0], bg[1], bg[2], 255], i * 4);
  return { w, h, px };
};
export function fillRect(img: Img, x0: number, y0: number, w: number, h: number, c: Rgb): void {
  for (let y = Math.max(0, y0); y < Math.min(img.h, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(img.w, x0 + w); x++) img.px.set([c[0], c[1], c[2], 255], (y * img.w + x) * 4);
}
export const hexRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

/** Copia uma foto para dentro de um quadro (encaixada, sem esticar). */
export function drawRaster(img: Img, src: Raster, x0: number, y0: number, bw: number, bh: number): void {
  const s = Math.min(bw / src.w, bh / src.h);
  const w = Math.round(src.w * s), h = Math.round(src.h * s);
  const ox = x0 + Math.floor((bw - w) / 2), oy = y0 + Math.floor((bh - h) / 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (Math.min(src.h - 1, Math.floor(y / s)) * src.w + Math.min(src.w - 1, Math.floor(x / s))) * 4;
      img.px.set([src.rgba[i], src.rgba[i + 1], src.rgba[i + 2], 255], ((oy + y) * img.w + ox + x) * 4);
    }
}

/** Desenha uma máscara (1 = objeto) em azul sobre o quadro, para ver o recorte. */
export function drawMask(img: Img, mask: Uint8Array, mw: number, mh: number, x0: number, y0: number, bw: number, bh: number): void {
  const s = Math.min(bw / mw, bh / mh);
  const w = Math.round(mw * s), h = Math.round(mh * s);
  const ox = x0 + Math.floor((bw - w) / 2), oy = y0 + Math.floor((bh - h) / 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const on = mask[Math.min(mh - 1, Math.floor(y / s)) * mw + Math.min(mw - 1, Math.floor(x / s))];
      if (!on) continue;
      const i = ((oy + y) * img.w + ox + x) * 4;
      img.px[i] = img.px[i] * 0.45 + 40 * 0.55;
      img.px[i + 1] = img.px[i + 1] * 0.45 + 120 * 0.55;
      img.px[i + 2] = img.px[i + 2] * 0.45 + 255 * 0.55;
    }
}

type View = "top" | "iso";
const AZ = (-35 * Math.PI) / 180, EL = (32 * Math.PI) / 180;
const LIGHT = [-0.35, 0.45, 0.82];

/** Projeta (x, y, z) do mundo para (tela x, tela y para cima, profundidade para o observador). */
function project(v: View, x: number, y: number, z: number): [number, number, number] {
  if (v === "top") return [x, y, z];
  const xr = x * Math.cos(AZ) - y * Math.sin(AZ), yr = x * Math.sin(AZ) + y * Math.cos(AZ);
  return [xr, z * Math.cos(EL) + yr * Math.sin(EL), -yr * Math.cos(EL) + z * Math.sin(EL)];
}
/** A normal do mundo na base da tela. */
function projectNormal(v: View, n: [number, number, number]): [number, number, number] {
  if (v === "top") return n;
  const xr = n[0] * Math.cos(AZ) - n[1] * Math.sin(AZ), yr = n[0] * Math.sin(AZ) + n[1] * Math.cos(AZ);
  return [xr, n[2] * Math.cos(EL) + yr * Math.sin(EL), -yr * Math.cos(EL) + n[2] * Math.sin(EL)];
}

/** Renderiza os modelos (todas as partes juntas) no quadro (x0, y0, bw, bh) da imagem. */
export function renderModels(img: Img, models: Model[], view: View, x0: number, y0: number, bw: number, bh: number, bg: Rgb): void {
  fillRect(img, x0, y0, bw, bh, bg);
  const parts = models.flatMap((m) => m.parts.map((p) => ({ mesh: p.mesh, color: hexRgb(p.color) })));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const proj = parts.map(({ mesh }) => {
    const out = new Float32Array(mesh.positions.length);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const [sx, sy, d] = project(view, mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
      out[i] = sx;
      out[i + 1] = sy;
      out[i + 2] = d;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
    return out;
  });
  if (!isFinite(minX)) return;
  const pad = 10;
  const s = Math.min((bw - 2 * pad) / (maxX - minX || 1), (bh - 2 * pad) / (maxY - minY || 1));
  const ox = x0 + (bw - (maxX - minX) * s) / 2, oy = y0 + (bh - (maxY - minY) * s) / 2;
  const sxOf = (x: number) => ox + (x - minX) * s, syOf = (y: number) => oy + (maxY - y) * s;
  const zbuf = new Float32Array(bw * bh).fill(-Infinity);
  const L = Math.hypot(...LIGHT);
  parts.forEach(({ mesh, color }, pi) => {
    const P = proj[pi];
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const ia = mesh.indices[t] * 3, ib = mesh.indices[t + 1] * 3, ic = mesh.indices[t + 2] * 3;
      // normal no mundo (a malha tem sentido anti-horário visto de fora)
      const m = mesh.positions;
      const ux = m[ib] - m[ia], uy = m[ib + 1] - m[ia + 1], uz = m[ib + 2] - m[ia + 2], vx = m[ic] - m[ia], vy = m[ic + 1] - m[ia + 1], vz = m[ic + 2] - m[ia + 2];
      let n: [number, number, number] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const len = Math.hypot(...n) || 1;
      n = projectNormal(view, [n[0] / len, n[1] / len, n[2] / len]);
      if (n[2] < 0) n = [-n[0], -n[1], -n[2]]; // face de trás desenhada como a da frente
      const shade = 0.42 + 0.58 * Math.max(0, (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / L);
      const ax = sxOf(P[ia]), ay = syOf(P[ia + 1]), bx = sxOf(P[ib]), by = syOf(P[ib + 1]), cx = sxOf(P[ic]), cy = syOf(P[ic + 1]);
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-9) continue;
      const xa = Math.max(x0, Math.floor(Math.min(ax, bx, cx))), xb = Math.min(x0 + bw - 1, Math.ceil(Math.max(ax, bx, cx)));
      const ya = Math.max(y0, Math.floor(Math.min(ay, by, cy))), yb = Math.min(y0 + bh - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = ya; y <= yb; y++)
        for (let x = xa; x <= xb; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, w2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, w3 = 1 - w1 - w2;
          if (w1 < -1e-4 || w2 < -1e-4 || w3 < -1e-4) continue;
          const d = w1 * P[ia + 2] + w2 * P[ib + 2] + w3 * P[ic + 2];
          const zi = (y - y0) * bw + (x - x0);
          if (d <= zbuf[zi]) continue;
          zbuf[zi] = d;
          const o = (y * img.w + x) * 4;
          img.px[o] = color[0] * shade;
          img.px[o + 1] = color[1] * shade;
          img.px[o + 2] = color[2] * shade;
        }
    }
  });
}

// ---------- PNG ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};

export function encodePng(img: Img): Uint8Array {
  const rows = new Uint8Array((img.w * 3 + 1) * img.h);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4, o = y * (img.w * 3 + 1) + 1 + x * 3;
      rows[o] = img.px[i];
      rows[o + 1] = img.px[i + 1];
      rows[o + 2] = img.px[i + 2];
    }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, img.w);
  dv.setUint32(4, img.h);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlibSync(rows, { level: 6 })), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
