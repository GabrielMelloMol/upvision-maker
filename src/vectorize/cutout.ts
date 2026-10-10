import { fillHoles, largestComponent } from "./cleanup";
import { morph } from "./raster";

/*
 * Recorte automático do fundo de uma foto (#193): devolve a máscara (e o contorno) do objeto principal.
 *  1. Fundo liso, quase liso ou em degradê: separação pela cor do fundo, amostrada nas bordas da foto e ajustada como uma
 *     superfície (plano + curvatura, para pegar degradê e vinheta), limpeza morfológica e só o maior componente. Offline e rápido.
 *  2. Fundo que não é liso: Silhueta (MediaPipe) — primeiro pessoa, depois o modelo de objetos (bicho, avião, carro…).
 * Quando o recorte é duvidoso, `uncertain` vem ligado e `warning` diz o que a pessoa pode fazer.
 */
export type CutoutMethod = "color" | "person" | "deeplab";
export type CutoutSubject = "auto" | "person" | "pet" | "object" | "plain";
export type Bbox = { x0: number; y0: number; x1: number; y1: number };
export type CutoutResult = {
  /** 1 = objeto, do tamanho da imagem. */
  mask: Uint8Array;
  method: CutoutMethod;
  /** 0 a 1: o quanto dá para confiar no recorte. */
  confidence: number;
  uncertain: boolean;
  warning: string | null;
  /** Fração da foto que o objeto ocupa. */
  coverage: number;
  bbox: Bbox;
};
/** Silhueta: máscara do objeto principal (1 = objeto) ou null. */
export type Segmenter = (rgba: Uint8ClampedArray, w: number, h: number, subject: "person" | "pet") => Promise<Uint8Array | null>;
export type CutoutOptions = { subject?: CutoutSubject; segment?: Segmenter };

const RING = 0.03; // largura da faixa da borda que mostra o fundo (fração do lado menor)
const MAX_SAMPLES = 5000;
const BG_SIGMA_OK = 4; // desvio do fundo (em níveis de cor) até onde é "liso"
const BG_SIGMA_BAD = 30; // acima disso o fundo não é liso: sem confiança no recorte por cor
const MIN_COVERAGE = 0.02;
const MAX_COVERAGE = 0.9;
const BORDER_TOUCH_WARN = 0.12; // fração da borda da foto ocupada pelo objeto
const CONFIDENT = 0.6;
const FLAT_ENOUGH = 0.75; // a cor basta; abaixo disso vale tentar a Silhueta
const ML_CONFIDENCE = 0.85;
const SHADOW_K = 0.78; // até 22% mais escuro que o fundo, na mesma cor, ainda é sombra
const OPEN_R = 1;
const CLOSE_R = 2;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ---------- ajuste da superfície do fundo (plano + curvatura) por mínimos quadrados ----------
const basis = (u: number, v: number) => [1, u, v, u * u, u * v, v * v];

function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    const d = m[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / d;
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / (row[i] || 1e-12));
}

type Sample = { u: number; v: number; c: [number, number, number] };

function fit(samples: Sample[]): number[][] {
  const A = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  const rhs = [0, 0, 0].map(() => new Array<number>(6).fill(0));
  for (const s of samples) {
    const b = basis(s.u, s.v);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) A[i][j] += b[i] * b[j];
      for (let d = 0; d < 3; d++) rhs[d][i] += b[i] * s.c[d];
    }
  }
  for (let i = 0; i < 6; i++) A[i][i] += 1e-9; // evita matriz singular em fotos minúsculas
  return rhs.map((r) => solve(A, r));
}

const predict = (coef: number[][], u: number, v: number): [number, number, number] => {
  const b = basis(u, v);
  return [0, 1, 2].map((d) => coef[d].reduce((s, k, i) => s + k * b[i], 0)) as [number, number, number];
};
const dist = (a: [number, number, number], b: ArrayLike<number>, o: number) => Math.hypot(a[0] - b[o], a[1] - b[o + 1], a[2] - b[o + 2]);

/** Fecha buracos pequenos sem comer o objeto que encosta na borda da foto (a borda é copiada antes de fechar). */
function closeSafe(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const W = w + 2 * r, H = h + 2 * r;
  const pad = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pad[y * W + x] = m[Math.min(h - 1, Math.max(0, y - r)) * w + Math.min(w - 1, Math.max(0, x - r))];
  const closed = morph(morph(pad, W, H, r, false), W, H, r, true);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = closed[(y + r) * W + x + r];
  return out;
}

const box = (mask: Uint8Array, w: number, h: number): Bbox => {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
};
const count = (m: Uint8Array) => m.reduce((a, v) => a + v, 0);

/** Fração da borda da foto (a faixa de fora) que o objeto ocupa. */
function borderTouch(mask: Uint8Array, w: number, h: number): number {
  let on = 0, all = 0;
  const visit = (x: number, y: number) => {
    all++;
    on += mask[y * w + x];
  };
  for (let x = 0; x < w; x++) {
    visit(x, 0);
    visit(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    visit(0, y);
    visit(w - 1, y);
  }
  return all ? on / all : 0;
}

/** Limpeza do que a IA devolve: só o maior componente e sem furos. */
function clean(m: Uint8Array, w: number, h: number): Uint8Array {
  return fillHoles(largestComponent(m, w, h), w, h);
}

function finish(mask: Uint8Array, w: number, h: number, method: CutoutMethod, confidence: number, warnings: string[]): CutoutResult {
  return { mask, method, confidence: clamp01(confidence), uncertain: confidence < CONFIDENT, warning: warnings.length ? warnings.join(" ") : null, coverage: count(mask) / (w * h), bbox: box(mask, w, h) };
}

/** Recorte pela cor do fundo (superfície ajustada nas bordas). Síncrono, sem IA. */
export function colorCutout(rgba: Uint8ClampedArray, w: number, h: number): CutoutResult {
  const rw = Math.max(2, Math.round(Math.min(w, h) * RING));
  const inRing = (x: number, y: number) => x < rw || y < rw || x >= w - rw || y >= h - rw;
  const total = w * h - Math.max(0, w - 2 * rw) * Math.max(0, h - 2 * rw);
  const step = Math.max(1, Math.ceil(total / MAX_SAMPLES));
  const samples: Sample[] = [];
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inRing(x, y) || n++ % step) continue;
      const i = (y * w + x) * 4;
      samples.push({ u: x / w - 0.5, v: y / h - 0.5, c: [rgba[i], rgba[i + 1], rgba[i + 2]] });
    }
  // 2 passadas: a 1ª ajuste tudo; a 2ª descarta o que se afasta muito (o objeto que encosta na borda) e ajusta de novo
  let coef = fit(samples);
  const res = samples.map((s) => Math.hypot(...([0, 1, 2].map((d) => s.c[d] - predict(coef, s.u, s.v)[d]) as [number, number, number])));
  const median = [...res].sort((a, b) => a - b)[Math.floor(res.length / 2)] ?? 0;
  const kept = samples.filter((_, i) => res[i] <= median * 2.5 + 8);
  if (kept.length >= 12) coef = fit(kept);
  const keptRes = (kept.length >= 12 ? kept : samples).map((s) => dist(predict(coef, s.u, s.v), s.c, 0));
  const sigma = Math.sqrt(keptRes.reduce((a, r) => a + r * r, 0) / Math.max(1, keptRes.length));

  const T = Math.min(80, Math.max(18, 3.5 * sigma + 8));
  const raw = new Uint8Array(w * h);
  let inside = 0;
  let insideSum = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const p = predict(coef, x / w - 0.5, y / h - 0.5);
      const nn = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
      // sombra = o fundo mais escuro na mesma cor: se o pixel é o fundo vezes k (k ≥ K_MIN), não é objeto
      const k = nn > 1 ? Math.min(1, Math.max(0, (rgba[o] * p[0] + rgba[o + 1] * p[1] + rgba[o + 2] * p[2]) / nn)) : 1;
      const chroma = Math.hypot(rgba[o] - k * p[0], rgba[o + 1] - k * p[1], rgba[o + 2] - k * p[2]);
      if (chroma > T || k < SHADOW_K) {
        raw[y * w + x] = 1;
        inside++;
        insideSum += dist(p, rgba, o);
      }
    }
  let mask = morph(morph(raw, w, h, OPEN_R, true), w, h, OPEN_R, false); // abertura: tira pontos soltos
  mask = closeSafe(mask, w, h, CLOSE_R);
  mask = fillHoles(largestComponent(mask, w, h), w, h);

  const coverage = count(mask) / (w * h);
  const touch = borderTouch(mask, w, h);
  const contrast = inside ? insideSum / inside / T : 0; // quantas vezes o limite o objeto se afasta do fundo, em média
  const warnings: string[] = [];
  let confidence = clamp01(1 - (sigma - BG_SIGMA_OK) / (BG_SIGMA_BAD - BG_SIGMA_OK)); // fundo liso = 1; bagunçado = 0
  if (sigma > BG_SIGMA_BAD * 0.6) warnings.push("O fundo da foto não é liso, então o recorte pode errar. Uma foto com fundo liso (ou o modo Silhueta, em Imagem em desenho) recorta melhor.");
  if (coverage < MIN_COVERAGE) {
    confidence = Math.min(confidence, 0.2);
    warnings.push("Quase não achei o objeto: ele tem a cor do fundo ou a foto está sem objeto. O recorte pode ficar vazio.");
  } else if (coverage > MAX_COVERAGE) {
    confidence = Math.min(confidence, 0.3);
    warnings.push("O recorte pegou quase a foto inteira: o fundo pode ter objetos ou sombras. Confira o resultado.");
  } else if (contrast < 1.3) {
    confidence = Math.min(confidence, 0.5);
    warnings.push("O objeto tem cor parecida com a do fundo; o recorte pode estar errado. Confira o resultado.");
  }
  if (touch > BORDER_TOUCH_WARN) {
    confidence = Math.min(confidence, 0.7);
    warnings.push("O objeto encosta na borda da foto; ele pode estar cortado.");
  }
  if (confidence < CONFIDENT && !warnings.length) warnings.push("O recorte é incerto. Confira o resultado.");
  return finish(mask, w, h, "color", confidence, warnings);
}

const ML_FAILED = "Não consegui usar a inteligência de recorte (Silhueta) agora; usei só a cor do fundo, e o recorte pode errar.";
const ML_EMPTY = "A Silhueta não achou pessoa nem bicho ou objeto na foto; usei a cor do fundo, e o recorte pode errar.";

async function defaultSegment(rgba: Uint8ClampedArray, w: number, h: number, subject: "person" | "pet"): Promise<Uint8Array | null> {
  const { segmentSubject } = await import("./segment"); // o MediaPipe só carrega quando precisa
  return segmentSubject(rgba, w, h, subject);
}

/**
 * Recorte do objeto principal. `auto`: cor do fundo quando ele é liso; senão, pessoa e, se não houver, o modelo de objetos.
 * `person`/`pet`/`object` forçam a Silhueta; `plain` força a cor.
 */
export async function cutout(rgba: Uint8ClampedArray, w: number, h: number, opts: CutoutOptions = {}): Promise<CutoutResult> {
  const subject = opts.subject ?? "auto";
  const color = colorCutout(rgba, w, h);
  if (subject === "plain" || (subject === "auto" && color.confidence >= FLAT_ENOUGH && !color.uncertain)) return color;
  const segment = opts.segment ?? defaultSegment;
  const order: ("person" | "pet")[] = subject === "person" ? ["person"] : subject === "pet" || subject === "object" ? ["pet"] : ["person", "pet"];
  let failed = false;
  for (const s of order) {
    try {
      const raw = await segment(rgba, w, h, s);
      if (!raw) continue;
      const mask = clean(raw, w, h);
      const coverage = count(mask) / (w * h);
      if (coverage < MIN_COVERAGE) continue; // não achou ninguém desse tipo: tenta o próximo
      const odd = coverage > MAX_COVERAGE;
      return finish(mask, w, h, s === "person" ? "person" : "deeplab", odd ? 0.4 : ML_CONFIDENCE, odd ? ["O recorte pegou quase a foto inteira; confira o resultado."] : []);
    } catch {
      failed = true;
    }
  }
  // sem Silhueta: fica a cor do fundo, com a confiança rebaixada e o motivo
  const warnings = [...(color.warning ? [color.warning] : []), failed ? ML_FAILED : ML_EMPTY];
  return finish(color.mask, w, h, "color", Math.min(color.confidence, 0.5), warnings);
}

// ---------- contorno ----------
type Pt = [number, number];

/** Distância de p ao segmento a–b. */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Douglas-Peucker numa linha aberta. */
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  let far = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > far) {
      far = d;
      at = i;
    }
  }
  if (far <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
}

const area = (r: Pt[]) => r.reduce((a, p, i) => a + (p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1]), 0) / 2;

/** Tira os pontos que ficam no meio de uma reta. */
function dropCollinear(r: Pt[]): Pt[] {
  return r.filter((p, i) => {
    const a = r[(i + r.length - 1) % r.length], b = r[(i + 1) % r.length];
    return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
  });
}

/**
 * Contorno externo da máscara, em pixels (cantos dos pixels, Y para baixo), um anel por objeto, do maior para o menor; furos não
 * entram. Com `epsilon` > 0 simplifica (Douglas-Peucker). Máscara vazia = [].
 */
export function maskOutline(mask: Uint8Array, w: number, h: number, epsilon = 0.8): Pt[][] {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  const key = (x: number, y: number) => y * (w + 1) + x;
  type Edge = { x0: number; y0: number; x1: number; y1: number; used: boolean };
  const out = new Map<number, Edge[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const e = { x0, y0, x1, y1, used: false };
    const k = key(x0, y0);
    out.set(k, [...(out.get(k) ?? []), e]);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y); // em cima: da esquerda para a direita
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
  const rings: Pt[][] = [];
  for (const list of out.values())
    for (const first of list) {
      if (first.used) continue;
      const ring: Pt[] = [];
      let e: Edge | undefined = first;
      while (e && !e.used) {
        e.used = true;
        ring.push([e.x0, e.y0]);
        const options: Edge[] = (out.get(key(e.x1, e.y1)) ?? []).filter((c) => !c.used);
        // em cantos onde dois pixels só se tocam na diagonal, vira à direita (mantém os pixels separados)
        const dx = e.x1 - e.x0, dy = e.y1 - e.y0;
        options.sort((a, b) => (dx * (b.y1 - b.y0) - dy * (b.x1 - b.x0)) - (dx * (a.y1 - a.y0) - dy * (a.x1 - a.x0)));
        e = options[0];
      }
      if (ring.length >= 3) rings.push(ring);
    }
  // anel externo = área positiva (sentido horário com Y para baixo); furos têm área negativa
  const outer = rings.filter((r) => area(r) > 0).sort((a, b) => area(b) - area(a));
  return outer.map((r) => {
    const exact = dropCollinear(r);
    if (epsilon <= 0 || exact.length < 8) return exact;
    // anel fechado: abre no ponto mais distante do primeiro e simplifica as duas metades
    let k = 0, best = 0;
    exact.forEach((p, i) => {
      const d = Math.hypot(p[0] - exact[0][0], p[1] - exact[0][1]);
      if (d > best) {
        best = d;
        k = i;
      }
    });
    const a = rdp(exact.slice(0, k + 1), epsilon), b = rdp([...exact.slice(k), exact[0]], epsilon);
    return [...a.slice(0, -1), ...b.slice(0, -1)];
  });
}
