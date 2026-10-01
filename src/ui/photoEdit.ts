/**
 * Ajuste rápido de foto (#162): girar, cortar numa proporção (centralizado, com zoom) e brilho. A conta do recorte é
 * pura (testável); o desenho usa canvas e sai em JPEG até 1024 px (o mesmo das fotos de produto: o PDF lê JPEG).
 */
export type Aspect = "free" | "1:1" | "4:3" | "3:4";
export type PhotoEdit = { rotate: 0 | 90 | 180 | 270; aspect: Aspect; zoom: number; brightness: number };
export const NO_EDIT: PhotoEdit = { rotate: 0, aspect: "free", zoom: 1, brightness: 0 };

const MAX_SIDE = 1024;
const QUALITY = 0.82;
const RATIO: Record<Exclude<Aspect, "free">, number> = { "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4 };

/** Recorte (na imagem já girada) centralizado na proporção pedida; zoom > 1 aperta no centro. */
export function cropRect(w: number, h: number, e: PhotoEdit): { x: number; y: number; w: number; h: number } {
  const [W, H] = e.rotate % 180 ? [h, w] : [w, h];
  let cw = W, ch = H;
  if (e.aspect !== "free") {
    const r = RATIO[e.aspect];
    if (W / H > r) cw = H * r;
    else ch = W / r;
  }
  const z = Math.max(1, e.zoom);
  cw /= z;
  ch /= z;
  return { x: Math.round((W - cw) / 2), y: Math.round((H - ch) / 2), w: Math.round(cw), h: Math.round(ch) };
}

export function outputSize(r: { w: number; h: number }): { w: number; h: number } {
  const s = Math.min(1, MAX_SIDE / Math.max(r.w, r.h));
  return { w: Math.round(r.w * s), h: Math.round(r.h * s) };
}

/** Aplica o ajuste e devolve o data URL JPEG. */
export function renderEdit(img: CanvasImageSource & { width: number; height: number }, e: PhotoEdit): string {
  // 1º gira a imagem inteira, depois recorta e reduz
  const turned = document.createElement("canvas");
  const swap = e.rotate % 180 !== 0;
  turned.width = swap ? img.height : img.width;
  turned.height = swap ? img.width : img.height;
  const t = turned.getContext("2d")!;
  t.translate(turned.width / 2, turned.height / 2);
  t.rotate((e.rotate * Math.PI) / 180);
  t.drawImage(img, -img.width / 2, -img.height / 2);
  const r = cropRect(img.width, img.height, e);
  const o = outputSize(r);
  const out = document.createElement("canvas");
  out.width = o.w;
  out.height = o.h;
  const c = out.getContext("2d")!;
  c.fillStyle = "#fff";
  c.fillRect(0, 0, o.w, o.h);
  c.filter = e.brightness ? `brightness(${100 + e.brightness}%)` : "none";
  c.imageSmoothingQuality = "high";
  c.drawImage(turned, r.x, r.y, r.w, r.h, 0, 0, o.w, o.h);
  return out.toDataURL("image/jpeg", QUALITY);
}

/** Data URL → imagem carregada (para editar uma foto já guardada). */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não consegui abrir esta foto."));
    img.src = src;
  });
}
