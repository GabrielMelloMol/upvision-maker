import type { Sheet, ToolOutline } from "../types";
import { cameraFromHomography, unParallaxMask, type Camera } from "./camera";
import { regionLoops, signedArea, simplifyLoop } from "./contour";
import { homography, type Pt } from "./homography";
import type { Gray } from "./image";
import { clean, erode, label, PX_PER_MM, rectify, relative, threshold, type Blob } from "./segment";
import { convexHull, order } from "./sheet";

export { exifFocal35, focalPxFrom35 } from "./camera";
export { lightness, type Gray, type Rgba } from "./image";
export { findSheetCorners } from "./sheet";
export type { Pt } from "./homography";

export const A4: Sheet = { widthMm: 210, heightMm: 297 };
export const LETTER: Sheet = { widthMm: 215.9, heightMm: 279.4 };

/** Margem da folha ignorada (a borda do papel na foto nunca é perfeita). */
const MARGIN_MM = 1.5;
/** Menor ferramenta considerada (mm²): menos que isso é sujeira ou furo do papel. */
const MIN_TOOL_MM2 = 30;
const MIN_HOLE_MM2 = 5;
/** Tolerância da simplificação do contorno (mm). */
const SIMPLIFY_MM = 0.1;
const MAX_TILT_DEG = 35;
/** Sem a focal, folha "muito inclinada" = um lado mais de 30% menor que o oposto. */
const MIN_SIDE_RATIO = 0.7;
/** Sombra forte: área de papel acinzentado maior que esta fração da área das ferramentas. */
const SHADOW_SHARE = 0.08;
const SHADOW_TOP = 0.85;
/**
 * Sombra dura dentro do contorno: luz direta faz uma sombra escura o bastante para passar do limiar e entrar na
 * ferramenta. Ela aparece como uma parte bem mais clara (mais de `SHADOW_STEP` acima do miolo da ferramenta) que ocupa
 * mais de `SHADOW_INSIDE` da área, longe da borda de meio-tom.
 */
const SHADOW_STEP = 0.15;
const SHADOW_INSIDE = 0.08;
const EDGE_PX = 4;
/** Canto a menos disso da borda da foto = a folha foi cortada. */
const CORNER_EDGE_PX = 4;

export type PhotoOptions = {
  sheet: Sheet;
  /** 4 cantos da folha na foto (px), em qualquer ordem. */
  corners: Pt[];
  /** Altura da parte mais larga da ferramenta deitada (mm): corrige a paralaxe. */
  heightMm?: number;
  /** Focal em px (do EXIF). Sem ela não há como saber a distância da câmera. */
  focalPx?: number | null;
};

export type PhotoResult = {
  outlines: ToolOutline[];
  /** A folha na orientação dos contornos (largura = lado do 1º ao 2º canto). */
  sheet: Sheet;
  warnings: string[];
  camera: Camera | null;
  /** Há altura para corrigir mas não há focal: peça uma medida de régua (`rescale`). */
  needsRuler: boolean;
};

/**
 * Foto → contornos das ferramentas em mm (#169). Endireita a folha para 10 px/mm pela homografia dos 4 cantos,
 * separa o que é bem mais escuro que o papel (limiar relativo à luz local + abertura/fechamento), um contorno por
 * região, com os furos, e corrige a paralaxe pela altura. Contorno com origem no canto 1, x para a direita e y para
 * cima (folha vista de cima), externo anti-horário e furos horários.
 */
export function measureTools(g: Gray, opts: PhotoOptions): PhotoResult {
  const corners = order(opts.corners);
  const side = (i: number) => Math.hypot(corners[(i + 1) % 4][0] - corners[i][0], corners[(i + 1) % 4][1] - corners[i][1]);
  const long = Math.max(opts.sheet.widthMm, opts.sheet.heightMm);
  const short = Math.min(opts.sheet.widthMm, opts.sheet.heightMm);
  const wide = side(0) + side(2) >= side(1) + side(3);
  const sheet: Sheet = wide ? { widthMm: long, heightMm: short } : { widthMm: short, heightMm: long };
  const W = sheet.widthMm;
  const H = sheet.heightMm;
  const toPhoto = homography(
    [[0, 0], [W, 0], [W, H], [0, H]],
    corners,
  );
  if (!toPhoto) return { outlines: [], sheet, warnings: ["Os cantos da folha estão alinhados: arraste cada um para um canto do papel."], camera: null, needsRuler: false };
  const camera = opts.focalPx ? cameraFromHomography(toPhoto, opts.focalPx, [g.width, g.height]) : null;

  const rect = rectify(g, toPhoto, W, H);
  const { width: w, height: h } = rect;
  const rel = relative(rect);
  const t = threshold(rel);
  const m = Math.round(MARGIN_MM * PX_PER_MM);
  const raw = new Uint8Array(w * h);
  for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) raw[y * w + x] = rel[y * w + x] < t ? 1 : 0;
  const height = opts.heightMm && opts.heightMm > 0 ? opts.heightMm : 0;
  const seen = clean(raw, w, h);
  const mask = camera && height ? unParallaxMask(seen, w, h, camera, height, PX_PER_MM) : seen;
  const { labels, blobs } = label(mask, w, h);

  const warnings: string[] = [];
  // px da folha endireitada → mm com y para cima
  const toMm = (loop: Pt[]): Pt[] => loop.map(([x, y]): Pt => [x / PX_PER_MM, H - y / PX_PER_MM]);
  const tools = blobs.filter((b) => b.area >= MIN_TOOL_MM2 * PX_PER_MM ** 2);
  tools.sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  const toolArea = tools.reduce((t, b) => t + b.area, 0);
  const edge = m + Math.round(0.5 * PX_PER_MM);
  const outlines = tools.map((b, i): ToolOutline => {
    if (b.box[0] <= edge || b.box[1] <= edge || b.box[2] >= w - 1 - edge || b.box[3] >= h - 1 - edge)
      warnings.push(`A ferramenta ${i + 1} sai da folha: o contorno foi cortado na borda. Fotografe de novo com ela toda em cima do papel.`);
    const loops = regionLoops({ labels, width: w, id: b.id, box: b.box })
      .map((l) => toMm(simplifyLoop(l, SIMPLIFY_MM * PX_PER_MM)))
      .sort((a, c) => Math.abs(signedArea(c)) - Math.abs(signedArea(a)));
    const [outer, ...rest] = loops;
    const holes = rest.filter((l) => Math.abs(signedArea(l)) >= MIN_HOLE_MM2).map((l) => (signedArea(l) > 0 ? [...l].reverse() : l));
    return {
      id: `ferramenta-${i + 1}`,
      label: `Ferramenta ${i + 1}`,
      points: signedArea(outer) < 0 ? [...outer].reverse() : outer,
      ...(holes.length && { holes }),
      ...(height && { heightMm: height }),
    };
  });

  const cut = corners.some(([x, y]) => x < CORNER_EDGE_PX || y < CORNER_EDGE_PX || x > g.width - CORNER_EDGE_PX || y > g.height - CORNER_EDGE_PX);
  if (cut) warnings.push("A folha não aparece inteira na foto: afaste o celular até ver os 4 cantos do papel com um pouco de mesa em volta.");
  if (!outlines.length) warnings.push("Não achei nenhuma ferramenta na folha. Use papel branco liso e ferramentas que contrastem com ele.");
  const tilted = camera ? camera.tiltDeg > MAX_TILT_DEG : Math.min(side(0), side(2)) / Math.max(side(0), side(2)) < MIN_SIDE_RATIO || Math.min(side(1), side(3)) / Math.max(side(1), side(3)) < MIN_SIDE_RATIO;
  if (tilted) warnings.push("A folha está muito inclinada na foto: fotografe mais de cima, com o celular paralelo à mesa, para medir melhor.");
  const lighter = lighterPart(rel, erode(mask, w, h, EDGE_PX), labels, tools);
  if (lighter.length)
    warnings.push(
      `${lighter.length === 1 ? `A ferramenta ${lighter[0]} tem` : `As ferramentas ${lighter.slice(0, -1).join(", ")} e ${lighter[lighter.length - 1]} têm`} uma parte colada bem mais clara que o resto: se for sombra, ela entrou no contorno e a medida sai maior. Fotografe com luz de cima ou difusa (perto de uma janela, sem lâmpada nem sol direto). Se for uma parte cromada da ferramenta, pode seguir.`,
    );
  let gray = 0;
  for (let y = m; y < h - m; y += 2) for (let x = m; x < w - m; x += 2) if (rel[y * w + x] >= t && rel[y * w + x] < SHADOW_TOP) gray += 4;
  if (toolArea > 0 && gray > toolArea * SHADOW_SHARE)
    warnings.push("Sombra forte perto das ferramentas: ela pode entrar no contorno. Use luz de cima ou difusa (perto de uma janela, sem sol direto).");

  return { outlines, sheet, warnings, camera, needsRuler: height > 0 && !camera };
}

/** Números (1, 2…) das ferramentas com uma parte grande bem mais clara que o miolo delas (provável sombra). */
function lighterPart(rel: Float32Array, inner: Uint8Array, labels: Int32Array, tools: Blob[]): number[] {
  const byId = new Map(tools.map((b, i) => [b.id, { n: i + 1, values: [] as number[] }]));
  for (let i = 0; i < inner.length; i++) if (inner[i]) byId.get(labels[i])?.values.push(rel[i]);
  return [...byId.values()].flatMap(({ n, values }) => {
    if (values.length < 100) return [];
    values.sort((a, b) => a - b);
    const core = values[Math.floor(values.length * 0.25)];
    const firstLight = values.findIndex((v) => v > core + SHADOW_STEP);
    return firstLight >= 0 && values.length - firstLight > values.length * SHADOW_INSIDE ? [n] : [];
  });
}

/**
 * Comprimento × largura da ferramenta como a régua mede: lados do menor retângulo que a envolve, em qualquer
 * ângulo (um dos lados dele sempre encosta num lado do fecho convexo).
 */
export function sizeMm(o: ToolOutline): { length: number; width: number } {
  const hull = convexHull(o.points);
  let best = { area: Infinity, length: 0, width: 0 };
  hull.forEach((a, i) => {
    const b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) return;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    let [lo, hi, nlo, nhi] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of hull) {
      const along = x * ux + y * uy;
      const across = -x * uy + y * ux;
      [lo, hi, nlo, nhi] = [Math.min(lo, along), Math.max(hi, along), Math.min(nlo, across), Math.max(nhi, across)];
    }
    const [d1, d2] = [hi - lo, nhi - nlo];
    if (d1 * d2 < best.area) best = { area: d1 * d2, length: Math.max(d1, d2), width: Math.min(d1, d2) };
  });
  return { length: best.length, width: best.width };
}

/**
 * Régua (sem EXIF): escala o contorno em torno do próprio centro para o comprimento medido. A paralaxe de uma
 * ferramenta é uma ampliação em torno do ponto embaixo da câmera; em torno do centro dela a forma é a mesma, só
 * muda de lugar, e o lugar na folha não importa para o encaixe.
 */
export function rescale(o: ToolOutline, factor: number): ToolOutline {
  const n = o.points.length;
  const c: Pt = [o.points.reduce((s, p) => s + p[0], 0) / n, o.points.reduce((s, p) => s + p[1], 0) / n];
  const f = (p: Pt): Pt => [c[0] + (p[0] - c[0]) * factor, c[1] + (p[1] - c[1]) * factor];
  return { ...o, points: o.points.map(f), ...(o.holes && { holes: o.holes.map((hole) => hole.map(f)) }) };
}
