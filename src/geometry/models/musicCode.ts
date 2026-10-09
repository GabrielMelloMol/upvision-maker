import { linkPayload, qrMatrix } from "../../domain/qr";
import type { CS, ManifoldToplevel } from "../manifold";
import { MIN_MODULE_MM } from "../qr3d";
import { scoped } from "../shape2d";
import { flatten, parsePath, type Contour } from "../svgPath";
import { roundedRect } from "./common";

/**
 * Código para chegar à música no Cartão de música: o QR code com o link (qualquer serviço) ou o código do Spotify, que a
 * câmera do app do Spotify lê. As duas saídas são regiões 2D em mm, centradas em (0, 0), para o cartão pôr em relevo.
 */
export type CodeKind = "none" | "qr" | "spotify";

/** Barras mais finas que isto (mm) saem mal com bico 0,4. */
export const MIN_BAR_MM = 1;
const KINDS = ["track", "album", "playlist", "artist", "episode", "show"];
const ID = /^[A-Za-z0-9]{22}$/;

export const SHORT_LINK_HELP = "Links curtos (spotify.link) não servem. No Spotify, toque em Compartilhar › Copiar link (o que começa com open.spotify.com) ou use o código spotify:track:…";

/** Link do Spotify (open.spotify.com/track/ID, com ou sem ?si=…, /intl-pt/, /embed/) ou URI (spotify:track:ID) → URI; null se não for. */
export function spotifyUri(input: string): string | null {
  const t = input.trim();
  const direct = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(t);
  if (direct) return KINDS.includes(direct[1]) && ID.test(direct[2]) ? `spotify:${direct[1]}:${direct[2]}` : null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!/(^|\.)spotify\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.findIndex((x) => KINDS.includes(x));
    return i >= 0 && ID.test(parts[i + 1] ?? "") ? `spotify:${parts[i]}:${parts[i + 1]}` : null;
  } catch {
    return null;
  }
}

/** Endereço do código (SVG) que o Spotify publica para a música; as cores não importam, só as barras. */
export const scannableUrl = (uri: string) => `https://scannables.scdn.co/uri/plain/svg/ffffff/black/640/${uri}`;

const MAX_SVG = 40_000;
const MIN_BARS = 10;
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const num = (v: string | undefined) => (v === undefined ? NaN : Number(v));

type Scannable = { vbW: number; vbH: number; bars: number; barW: number };

/** Confere que o texto é mesmo o SVG do código (viewBox, barras com cantos redondos) e devolve as medidas; null se não for. */
export function checkScannable(svg: string): Scannable | null {
  if (!svg || svg.length > MAX_SVG || !/^\s*<svg[\s>]/i.test(svg)) return null;
  const vb = /viewBox="\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  if (!vb) return null;
  const [vbW, vbH] = [Number(vb[1]), Number(vb[2])];
  const rects = [...svg.matchAll(/<rect\b[^>]*>/g)].map((m) => m[0]);
  const bars = rects.filter((r) => num(attr(r, "rx")) > 0 && num(attr(r, "width")) > 0 && num(attr(r, "height")) > num(attr(r, "width")));
  if (bars.length < MIN_BARS || !Number.isFinite(vbW) || !Number.isFinite(vbH)) return null;
  return { vbW, vbH, bars: bars.length, barW: Math.min(...bars.map((r) => num(attr(r, "width")))) };
}

const LOGO = /<g\b[^>]*transform="translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)"[^>]*>\s*<path\b[^>]*\sd="([^"]+)"/;
const LOGO_SEGMENT = 0.5; // unidades do SVG por segmento nas curvas do logo

/** As barras (retângulos de cantos redondos) e, se pedido e legível, o logo do SVG, em unidades dele (Y para baixo). Sem DOM: o formato é conhecido. */
function scannableRegions(M: ManifoldToplevel, svg: string, withLogo: boolean): { regions: CS[]; logo: boolean } {
  const regions: CS[] = [];
  for (const m of svg.matchAll(/<rect\b[^>]*>/g)) {
    const [x, y, w, h, rx] = ["x", "y", "width", "height", "rx"].map((n) => num(attr(m[0], n)));
    if (!(rx > 0 && w > 0 && h > w)) continue; // o fundo e o que não é barra ficam de fora
    regions.push(scoped((k) => k(roundedRect(M, w, h, rx)).translate([x + w / 2, y + h / 2])));
  }
  let logo = false;
  const g = withLogo ? LOGO.exec(svg) : null;
  if (g) {
    try {
      const [tx, ty] = [Number(g[1]), Number(g[2])];
      const contours = flatten(parsePath(g[3]), LOGO_SEGMENT).map((c): Contour => c.map(([px, py]) => [px + tx, py + ty]));
      if (contours.length) {
        regions.push(new M.CrossSection(contours, "NonZero"));
        logo = true;
      }
    } catch {
      // desenho do logo que o app não lê: o código sai só com as barras
    }
  }
  return { regions, logo };
}

export type CodeShape = { cs: CS; w: number; h: number; /** o logo entrou no desenho */ logo?: boolean; /** menor traço do código em mm: módulo do QR ou barra do Spotify */ featureMm: number; modules?: number };

/** Dá delete() em `cs`. */
export function qrShape(M: ManifoldToplevel, link: string, widthMm: number): CodeShape {
  const m = qrMatrix(linkPayload(link));
  const n = m.length;
  const unit = widthMm / n;
  const polys: [number, number][][] = [];
  m.forEach((row, r) => {
    // trechos escuros seguidos viram um retângulo só
    for (let c = 0; c < n; c++) {
      if (!row[c]) continue;
      let e = c;
      while (e + 1 < n && row[e + 1]) e++;
      const [x0, x1, y1, y0] = [c * unit, (e + 1) * unit, (n - r) * unit, (n - r - 1) * unit];
      polys.push([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
      c = e;
    }
  });
  const raw = new M.CrossSection(polys, "NonZero");
  const cs = raw.translate([-widthMm / 2, -widthMm / 2]);
  raw.delete();
  return { cs, w: widthMm, h: widthMm, featureMm: unit, modules: n };
}

/** Barras (e logo) do SVG do Spotify em mm, com a largura de `widthMm`, centradas e com o Y para cima. Dá delete() em `cs`. */
export function spotifyShape(M: ManifoldToplevel, svg: string, withLogo: boolean, widthMm: number): CodeShape {
  const info = checkScannable(svg);
  if (!info) throw new Error("O código do Spotify guardado não é válido: busque de novo.");
  return scoped((k) => {
    const { regions, logo } = scannableRegions(M, svg, withLogo);
    const raw = k(M.CrossSection.union(regions));
    regions.forEach((r) => r.delete());
    const b = raw.bounds();
    const [bw, bh] = [b.max[0] - b.min[0], b.max[1] - b.min[1]];
    const s = widthMm / bw;
    const cs = k(k(raw.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2])).scale([s, -s])); // Y do SVG é para baixo
    return { cs: cs.translate([0, 0]), w: widthMm, h: bh * s, logo, featureMm: info.barW * s };
  });
}

export type CodeInput = { code: CodeKind; link: string; svg: string; svgUri: string; logo: boolean };
export type CodeResult = { shape: CodeShape | null; kind: "qr" | "spotify" | null; warnings: string[] };

const mm = (n: number) => n.toFixed(2).replace(".", ",");

/**
 * O código que o cartão desenha, na largura pedida. O do Spotify só vale se o SVG guardado é da música do link; sem ele
 * (ou com ele de outra música) volta ao QR do mesmo link e avisa. Link que não dá QR: sem código, com o motivo.
 */
export function buildCode(M: ManifoldToplevel, c: CodeInput, widthMm: number): CodeResult {
  const warnings: string[] = [];
  if (c.code === "none" || !c.link.trim()) return { shape: null, kind: null, warnings };
  const uri = c.code === "spotify" ? spotifyUri(c.link) : null;
  if (c.code === "spotify") {
    if (uri && c.svg && c.svgUri === uri && checkScannable(c.svg)) {
      const shape = spotifyShape(M, c.svg, c.logo, widthMm);
      if (c.logo && !shape.logo) warnings.push("Não consegui desenhar o logo do Spotify: o código saiu só com as barras (ele lê do mesmo jeito).");
      if (shape.featureMm < MIN_BAR_MM) warnings.push(`As barras do código do Spotify ficaram com ${mm(shape.featureMm)} mm: aumente a largura do código (mínimo recomendado ${mm(MIN_BAR_MM)} mm).`);
      return { shape, kind: "spotify", warnings };
    }
    warnings.push(uri ? "Falta buscar o código do Spotify desta música (botão Buscar o código): enquanto isso o cartão leva o QR code do mesmo link." : "Não achei uma música do Spotify nesse link: cole o link da música (open.spotify.com/…) ou o código spotify:track:… O cartão leva o QR code do link por enquanto.");
  }
  try {
    const shape = qrShape(M, c.link, widthMm);
    if (shape.featureMm < MIN_MODULE_MM) warnings.push(`Cada módulo do QR ficou com ${mm(shape.featureMm)} mm: aumente a largura do código ou use um link mais curto (mínimo recomendado ${mm(MIN_MODULE_MM)} mm).`);
    return { shape, kind: "qr", warnings };
  } catch {
    warnings.push("Isso não parece um link: o cartão sai sem código. Ex.: open.spotify.com/track/… ou youtube.com/watch?v=…");
    return { shape: null, kind: null, warnings };
  }
}

/** Luminância relativa (0 a 1) de uma cor #rrggbb. */
export function luminance(hex: string): number {
  const v = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!v) return 0.5;
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
