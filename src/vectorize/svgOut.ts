import { mapPoints, parsePath, serializePath } from "../geometry/svgPath";

const PATH_TAG = /<path\b([^>]*)>/g;
const ATTR = (name: string) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`);
const TRANSLATE = /^\s*translate\(\s*(-?[\d.e+-]+)(?:[\s,]+(-?[\d.e+-]+))?\s*\)\s*$/;

/** Junta todos os <path> do SVG do vtracer num único `d` absoluto (aplica os translate). Só aceita d= e translate(). */
export function extractPaths(svg: string): string {
  if (/<!ENTITY/i.test(svg)) throw new Error("SVG com declarações ENTITY não é aceito.");
  const parts: string[] = [];
  for (const [, attrs] of svg.matchAll(PATH_TAG)) {
    const d = ATTR("d").exec(attrs)?.[1];
    if (!d) continue;
    const tf = ATTR("transform").exec(attrs)?.[1];
    let dx = 0, dy = 0;
    if (tf) {
      const m = TRANSLATE.exec(tf);
      if (!m) throw new Error(`transform não suportado: ${tf}`);
      dx = Number(m[1]);
      dy = Number(m[2] ?? 0);
    }
    parts.push(serializePath(mapPoints(parsePath(d), ([x, y]) => [x + dx, y + dy]), 2));
  }
  return parts.join("");
}

const mm = (n: number) => String(Number(n.toFixed(3)));

/** SVG final: 1 caminho, preenchimento evenodd (furos corretos), largura física em mm. */
export function buildSvg(d: string, w: number, h: number, widthMm: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${mm(widthMm)}mm" height="${mm((widthMm * h) / w)}mm" viewBox="0 0 ${w} ${h}">` +
    `<path fill="#000" fill-rule="evenodd" stroke="none" d="${d}"/></svg>`
  );
}

export type ColorLayer = { color: string; d: string };

/** SVG colorido: um caminho por cor, em ordem de pintura (cada um cobre os de baixo, sem fresta). */
export function buildColorSvg(layers: ColorLayer[], w: number, h: number, widthMm: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${mm(widthMm)}mm" height="${mm((widthMm * h) / w)}mm" viewBox="0 0 ${w} ${h}">` +
    layers.map((l) => `<path fill="${l.color}" fill-rule="evenodd" stroke="none" d="${l.d}"/>`).join("") +
    `</svg>`
  );
}
