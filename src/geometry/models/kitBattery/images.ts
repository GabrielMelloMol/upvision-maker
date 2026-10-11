/*
 * Imagens próprias da bateria do Kit card (sem direitos de terceiros): desenhadas em código com distâncias com sinal (SDF),
 * bordas suaves e ruído determinístico, como um PNG ou uma foto que alguém mandaria.
 */
export type Rgb = [number, number, number];
export type Raster = { rgba: Uint8ClampedArray; w: number; h: number };
/** Distância com sinal em pixels: negativa dentro da forma. */
export type Sdf = (x: number, y: number) => number;
type Layer = { sd: Sdf; color: Rgb | ((x: number, y: number) => Rgb) };
export type ImageCase = { id: string; name: string; group: string; bg: Rgb | ((x: number, y: number) => Rgb); noise: number; layers: Layer[]; w?: number; h?: number };

export const W = 480, H = 320;

// ---------- formas ----------
export const circle = (cx: number, cy: number, r: number): Sdf => (x, y) => Math.hypot(x - cx, y - cy) - r;
export const ellipse = (cx: number, cy: number, rx: number, ry: number): Sdf => (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
export const box = (x0: number, y0: number, x1: number, y1: number): Sdf => (x, y) => {
  const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
  return dx || dy ? Math.hypot(dx, dy) : -Math.min(x - x0, x1 - x, y - y0, y1 - y);
};
export const roundBox = (x0: number, y0: number, x1: number, y1: number, r: number): Sdf => {
  const b = box(x0 + r, y0 + r, x1 - r, y1 - r);
  return (x, y) => b(x, y) - r;
};
export function poly(pts: [number, number][]): Sdf {
  return (x, y) => {
    let d = Infinity, inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[j], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    }
    return inside ? -d : d;
  };
}
export const union = (...s: Sdf[]): Sdf => (x, y) => Math.min(...s.map((f) => f(x, y)));
export const minus = (a: Sdf, ...b: Sdf[]): Sdf => (x, y) => Math.max(a(x, y), ...b.map((f) => -f(x, y)));
/** Só o contorno de uma forma, com a espessura pedida (linha fina). */
export const outline = (s: Sdf, thick: number): Sdf => (x, y) => Math.abs(s(x, y)) - thick / 2;
export const grow = (s: Sdf, r: number): Sdf => (x, y) => s(x, y) - r;
/** Segmento grosso (traço de letra ou de desenho). */
export const stroke = (x0: number, y0: number, x1: number, y1: number, thick: number): Sdf => (x, y) => {
  const dx = x1 - x0, dy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - x0 - t * dx, y - y0 - t * dy) - thick / 2;
};

// ---------- cores ----------
const gray = (v: number): Rgb => [v, v, v];
/** Cor com sombreado vertical (como luz de cima numa foto). */
const shaded = (c: Rgb, y0: number, y1: number): ((x: number, y: number) => Rgb) => (_x, y) => {
  const k = 1.1 - 0.4 * Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  return [c[0] * k, c[1] * k, c[2] * k];
};
const sombra = (cx: number, cy: number, rx: number, ry: number, base: Rgb): ((x: number, y: number) => Rgb) => (x, y) => {
  const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
  const k = d < 1 ? 1 - 0.14 * (1 - d) : 1;
  return [base[0] * k, base[1] * k, base[2] * k];
};
const messy = (x: number, y: number): Rgb => {
  const a = (Math.floor(x / 14) + Math.floor(y / 14)) % 2;
  const b = Math.sin(x / 23) * Math.cos(y / 17) > 0.2;
  return b ? [200, 90, 60] : a ? [60, 150, 170] : [230, 210, 120];
};
const stripes = (x: number, y: number): Rgb => ((Math.floor((x + y) / 12) % 3) === 0 ? [240, 190, 70] : (Math.floor((x - y) / 31) % 2) ? [90, 140, 90] : [170, 80, 120]);

// ---------- desenhos ----------
const planeSide = (cx: number, cy: number, s: number): Sdf =>
  union(
    ellipse(cx, cy, 190 * s, 22 * s),
    poly([[cx - 20 * s, cy], [cx + 60 * s, cy - 110 * s], [cx + 90 * s, cy - 110 * s], [cx + 50 * s, cy]]),
    poly([[cx - 20 * s, cy], [cx + 60 * s, cy + 110 * s], [cx + 90 * s, cy + 110 * s], [cx + 50 * s, cy]]),
    poly([[cx - 150 * s, cy - 8 * s], [cx - 175 * s, cy - 80 * s], [cx - 140 * s, cy - 80 * s], [cx - 105 * s, cy - 8 * s]]),
  );
const carSide = (cx: number, cy: number, s: number): Sdf =>
  union(
    roundBox(cx - 170 * s, cy - 10 * s, cx + 170 * s, cy + 50 * s, 18 * s),
    poly([[cx - 90 * s, cy - 8 * s], [cx - 50 * s, cy - 62 * s], [cx + 70 * s, cy - 62 * s], [cx + 120 * s, cy - 8 * s]]),
    circle(cx - 100 * s, cy + 52 * s, 36 * s),
    circle(cx + 100 * s, cy + 52 * s, 36 * s),
  );
const dogSide = (cx: number, cy: number, s: number): Sdf =>
  union(
    roundBox(cx - 110 * s, cy - 40 * s, cx + 90 * s, cy + 30 * s, 22 * s),
    circle(cx + 120 * s, cy - 52 * s, 36 * s),
    poly([[cx + 138 * s, cy - 84 * s], [cx + 160 * s, cy - 120 * s], [cx + 168 * s, cy - 70 * s]]),
    box(cx - 100 * s, cy + 20 * s, cx - 76 * s, cy + 100 * s),
    box(cx - 50 * s, cy + 20 * s, cx - 26 * s, cy + 100 * s),
    box(cx + 40 * s, cy + 20 * s, cx + 64 * s, cy + 100 * s),
    box(cx + 76 * s, cy + 20 * s, cx + 100 * s, cy + 100 * s),
    stroke(cx - 108 * s, cy - 30 * s, cx - 160 * s, cy - 90 * s, 16 * s),
  );
const truckSide = (cx: number, cy: number, s: number): Sdf =>
  union(
    box(cx - 190 * s, cy - 70 * s, cx + 30 * s, cy + 30 * s),
    poly([[cx + 40 * s, cy - 40 * s], [cx + 100 * s, cy - 40 * s], [cx + 150 * s, cy], [cx + 150 * s, cy + 30 * s], [cx + 40 * s, cy + 30 * s]]),
    circle(cx - 130 * s, cy + 40 * s, 30 * s),
    circle(cx - 50 * s, cy + 40 * s, 30 * s),
    circle(cx + 100 * s, cy + 40 * s, 30 * s),
  );
const fish = (cx: number, cy: number, s: number): Sdf =>
  union(ellipse(cx, cy, 130 * s, 62 * s), poly([[cx + 110 * s, cy], [cx + 190 * s, cy - 60 * s], [cx + 190 * s, cy + 60 * s]]), poly([[cx - 20 * s, cy - 55 * s], [cx + 20 * s, cy - 100 * s], [cx + 50 * s, cy - 50 * s]]));
const star = (cx: number, cy: number, R: number): Sdf => poly(Array.from({ length: 10 }, (_, i): [number, number] => [cx + (i % 2 ? R * 0.42 : R) * Math.sin((i * Math.PI) / 5), cy - (i % 2 ? R * 0.42 : R) * Math.cos((i * Math.PI) / 5)]));
const gear = (cx: number, cy: number, R: number): Sdf =>
  minus(union(circle(cx, cy, R * 0.85), ...Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return stroke(cx + R * 0.8 * Math.cos(a), cy + R * 0.8 * Math.sin(a), cx + R * 1.02 * Math.cos(a), cy + R * 1.02 * Math.sin(a), R * 0.26); })), circle(cx, cy, R * 0.3));
const house = (cx: number, cy: number, s: number): Sdf =>
  minus(union(box(cx - 110 * s, cy - 20 * s, cx + 110 * s, cy + 100 * s), poly([[cx - 140 * s, cy - 20 * s], [cx, cy - 110 * s], [cx + 140 * s, cy - 20 * s]])), box(cx - 20 * s, cy + 30 * s, cx + 30 * s, cy + 100 * s), box(cx - 85 * s, cy + 10 * s, cx - 45 * s, cy + 50 * s), box(cx + 55 * s, cy + 10 * s, cx + 95 * s, cy + 50 * s));
const heart = (cx: number, cy: number, s: number): Sdf => union(circle(cx - 45 * s, cy - 30 * s, 55 * s), circle(cx + 45 * s, cy - 30 * s, 55 * s), poly([[cx - 96 * s, cy - 2 * s], [cx + 96 * s, cy - 2 * s], [cx, cy + 110 * s]]));
const rocket = (cx: number, cy: number, s: number): Sdf => union(ellipse(cx, cy, 48 * s, 120 * s), poly([[cx - 40 * s, cy + 40 * s], [cx - 95 * s, cy + 125 * s], [cx - 30 * s, cy + 90 * s]]), poly([[cx + 40 * s, cy + 40 * s], [cx + 95 * s, cy + 125 * s], [cx + 30 * s, cy + 90 * s]]));
const planeTop = (cx: number, cy: number, s: number): Sdf =>
  union(ellipse(cx, cy, 24 * s, 130 * s), poly([[cx - 20 * s, cy - 10 * s], [cx - 170 * s, cy + 40 * s], [cx - 160 * s, cy + 70 * s], [cx - 14 * s, cy + 40 * s]]), poly([[cx + 20 * s, cy - 10 * s], [cx + 170 * s, cy + 40 * s], [cx + 160 * s, cy + 70 * s], [cx + 14 * s, cy + 40 * s]]), poly([[cx - 10 * s, cy + 100 * s], [cx - 70 * s, cy + 135 * s], [cx + 70 * s, cy + 135 * s], [cx + 10 * s, cy + 100 * s]]));
/** Letras de caixa feitas de traços (K, I, T). */
const letter = (ch: string, x: number, y: number, hgt: number, th: number): Sdf => {
  const w = hgt * 0.6;
  const parts: Record<string, Sdf[]> = {
    K: [stroke(x, y, x, y + hgt, th), stroke(x + w, y, x, y + hgt * 0.55, th), stroke(x + w, y + hgt, x + hgt * 0.1, y + hgt * 0.45, th)],
    I: [stroke(x + w / 2, y, x + w / 2, y + hgt, th)],
    T: [stroke(x, y, x + w, y, th), stroke(x + w / 2, y, x + w / 2, y + hgt, th)],
    A: [stroke(x, y + hgt, x + w / 2, y, th), stroke(x + w / 2, y, x + w, y + hgt, th), stroke(x + w * 0.2, y + hgt * 0.65, x + w * 0.8, y + hgt * 0.65, th)],
    R: [stroke(x, y, x, y + hgt, th), stroke(x, y, x + w, y + hgt * 0.15, th), stroke(x + w, y + hgt * 0.15, x, y + hgt * 0.5, th), stroke(x + w * 0.3, y + hgt * 0.5, x + w, y + hgt, th)],
    F: [stroke(x, y, x, y + hgt, th), stroke(x, y, x + w, y, th), stroke(x, y + hgt * 0.5, x + w * 0.8, y + hgt * 0.5, th)],
    O: [stroke(x, y, x + w, y, th), stroke(x, y + hgt, x + w, y + hgt, th), stroke(x, y, x, y + hgt, th), stroke(x + w, y, x + w, y + hgt, th)],
    C: [stroke(x, y, x + w, y, th), stroke(x, y + hgt, x + w, y + hgt, th), stroke(x, y, x, y + hgt, th)],
    E: [stroke(x, y, x, y + hgt, th), stroke(x, y, x + w, y, th), stroke(x, y + hgt * 0.5, x + w * 0.8, y + hgt * 0.5, th), stroke(x, y + hgt, x + w, y + hgt, th)],
  };
  return union(...(parts[ch] ?? []));
};
const word = (text: string, x: number, y: number, hgt: number, th: number): Sdf => union(...[...text].map((c, i) => letter(c, x + i * hgt * 0.85, y, hgt, th)));

const C = {
  navy: [40, 60, 100] as Rgb, red: [190, 50, 45] as Rgb, steel: [120, 130, 145] as Rgb, olive: [90, 110, 70] as Rgb, tan: [180, 140, 90] as Rgb, black: [25, 25, 28] as Rgb, white: [250, 250, 250] as Rgb,
};
const flatBg = (v: number): Rgb => gray(v);

export const CASES: ImageCase[] = [
  { id: "01-circulo", name: "Círculo (silhueta simples)", group: "silhueta simples", bg: flatBg(255), noise: 0, layers: [{ sd: circle(240, 160, 110), color: C.navy }] },
  { id: "02-estrela", name: "Estrela", group: "silhueta simples", bg: flatBg(255), noise: 0, layers: [{ sd: star(240, 165, 130), color: C.red }] },
  { id: "03-coracao", name: "Coração", group: "silhueta simples", bg: flatBg(250), noise: 1, layers: [{ sd: heart(240, 150, 1.2), color: C.red }] },
  { id: "04-aviao-linha", name: "Avião em linha (traço de 4 px)", group: "desenho de linha", bg: flatBg(255), noise: 0, layers: [{ sd: outline(planeSide(240, 165, 1), 4), color: C.black }] },
  { id: "05-carro-linha-fina", name: "Carro em contorno fino (1,5 px)", group: "contorno fino", bg: flatBg(255), noise: 0, layers: [{ sd: outline(carSide(240, 150, 1), 1.5), color: C.black }] },
  { id: "06-casa-icone", name: "Ícone de casa (porta e janelas vazadas)", group: "ícone", bg: flatBg(255), noise: 0, layers: [{ sd: house(240, 150, 1), color: C.navy }] },
  { id: "07-engrenagem-icone", name: "Ícone de engrenagem", group: "ícone", bg: flatBg(255), noise: 0, layers: [{ sd: gear(240, 160, 120), color: C.steel }] },
  { id: "08-foguete", name: "Foguete (objeto em pé)", group: "ícone", bg: flatBg(255), noise: 0, layers: [{ sd: rocket(240, 160, 1), color: C.red }, { sd: circle(240, 130, 20), color: C.white }] },
  { id: "09-aviao-foto-liso", name: "Avião, foto com fundo liso e sombra", group: "foto fundo liso", bg: sombra(240, 280, 190, 18, [226, 230, 236]), noise: 4, layers: [{ sd: planeSide(240, 150, 1), color: shaded(C.steel, 100, 200) }] },
  { id: "10-carro-foto-liso", name: "Carro, foto com fundo liso em degradê", group: "foto fundo liso", bg: (x, y) => [215 - y * 0.12 - x * 0.03, 225 - y * 0.12, 240 - y * 0.1], noise: 5, layers: [{ sd: carSide(240, 150, 1), color: shaded(C.red, 90, 210) }] },
  { id: "11-gato-foto-liso", name: "Animal (cachorro), foto com fundo liso", group: "foto fundo liso", bg: flatBg(238), noise: 4, layers: [{ sd: dogSide(230, 130, 1), color: shaded(C.tan, 60, 240) }] },
  { id: "12-carro-fundo-bagunca", name: "Carro com fundo bagunçado (xadrez e manchas)", group: "foto fundo bagunçado", bg: messy, noise: 6, layers: [{ sd: carSide(240, 150, 1), color: shaded(C.navy, 90, 210) }] },
  { id: "13-cachorro-fundo-bagunca", name: "Cachorro com fundo de listras", group: "foto fundo bagunçado", bg: stripes, noise: 6, layers: [{ sd: dogSide(230, 130, 1), color: shaded(C.tan, 60, 240) }] },
  { id: "14-texto-grosso", name: "Texto grosso (KIT)", group: "texto", bg: flatBg(255), noise: 0, layers: [{ sd: word("KIT", 62, 85, 150, 30), color: C.black }] },
  { id: "15-texto-fino", name: "Texto pequeno e fino (AIR FORCE)", group: "texto", bg: flatBg(255), noise: 0, layers: [{ sd: word("AIR", 60, 120, 70, 3), color: C.black }, { sd: word("FORCE", 220, 120, 70, 3), color: C.black }] },
  { id: "16-tres-circulos", name: "Várias figuras: três círculos", group: "várias figuras", bg: flatBg(255), noise: 0, layers: [{ sd: union(circle(110, 160, 70), circle(240, 160, 60), circle(370, 160, 50)), color: C.olive }] },
  { id: "17-aviao-e-satelites", name: "Avião com dois satélites pequenos soltos", group: "várias figuras", bg: flatBg(252), noise: 1, layers: [{ sd: union(planeSide(240, 165, 0.85), circle(70, 50, 9), circle(420, 270, 7)), color: C.steel }] },
  { id: "18-carro-frente", name: "Carro visto de frente (simétrico)", group: "de frente", bg: flatBg(255), noise: 0, layers: [{ sd: minus(union(roundBox(110, 120, 370, 250, 24), poly([[140, 125], [180, 60], [300, 60], [340, 125]]), circle(160, 252, 30), circle(320, 252, 30)), poly([[190, 120], [200, 76], [280, 76], [290, 120]])), color: C.navy }] },
  { id: "19-cachorro", name: "Animal: cachorro estilizado", group: "animal", bg: flatBg(255), noise: 0, layers: [{ sd: dogSide(230, 130, 1), color: C.tan }] },
  { id: "20-peixe", name: "Animal: peixe", group: "animal", bg: flatBg(252), noise: 2, layers: [{ sd: minus(fish(220, 160, 1), circle(150, 145, 9)), color: C.navy }] },
  { id: "21-caminhao", name: "Veículo: caminhão", group: "veículo", bg: flatBg(255), noise: 0, layers: [{ sd: truckSide(240, 150, 1), color: C.red }] },
  { id: "22-bicicleta-fina", name: "Veículo: bicicleta em traço fino (2 px)", group: "contorno fino", bg: flatBg(255), noise: 0, layers: [{ sd: union(outline(circle(130, 210, 70), 2), outline(circle(350, 210, 70), 2), stroke(130, 210, 230, 120, 2), stroke(230, 120, 350, 210, 2), stroke(230, 120, 300, 120, 2), stroke(130, 210, 300, 120, 2)), color: C.black }] },
  { id: "23-aviao-cacador", name: "Avião de lado (silhueta cheia)", group: "avião", bg: flatBg(255), noise: 0, layers: [{ sd: planeSide(240, 165, 1), color: C.steel }] },
  { id: "24-aviao-de-cima", name: "Avião visto de cima", group: "avião", bg: flatBg(255), noise: 0, layers: [{ sd: planeTop(240, 150, 1), color: C.steel }] },
];

/**
 * Resultado esperado do `cutout()` (sem a Silhueta, que não roda no Node) para cada imagem: serve de fixture para quem mostra o
 * recorte na interface. `coverage` é a fração da foto que o objeto ocupa (tolerância de ±0,03). Fundo bagunçado e texto fino
 * saem `uncertain` de propósito: a interface precisa avisar.
 */
export const EXPECTED_CUTOUT: Record<string, { method: "color" | "person" | "deeplab"; uncertain: boolean; coverage: number }> = {
  "01-circulo": { method: "color", uncertain: false, coverage: 0.25 },
  "02-estrela": { method: "color", uncertain: false, coverage: 0.14 },
  "03-coracao": { method: "color", uncertain: false, coverage: 0.24 },
  "04-aviao-linha": { method: "color", uncertain: false, coverage: 0.18 },
  "05-carro-linha-fina": { method: "color", uncertain: false, coverage: 0.22 },
  "06-casa-icone": { method: "color", uncertain: false, coverage: 0.23 },
  "07-engrenagem-icone": { method: "color", uncertain: false, coverage: 0.29 },
  "08-foguete": { method: "color", uncertain: false, coverage: 0.14 },
  "09-aviao-foto-liso": { method: "color", uncertain: false, coverage: 0.16 },
  "10-carro-foto-liso": { method: "color", uncertain: false, coverage: 0.22 },
  "11-gato-foto-liso": { method: "color", uncertain: false, coverage: 0.18 },
  "12-carro-fundo-bagunca": { method: "color", uncertain: true, coverage: 0.93 },
  "13-cachorro-fundo-bagunca": { method: "color", uncertain: true, coverage: 0.34 },
  "14-texto-grosso": { method: "color", uncertain: false, coverage: 0.08 },
  "15-texto-fino": { method: "color", uncertain: true, coverage: 0.01 },
  "16-tres-circulos": { method: "color", uncertain: false, coverage: 0.18 },
  "17-aviao-e-satelites": { method: "color", uncertain: false, coverage: 0.11 },
  "18-carro-frente": { method: "color", uncertain: false, coverage: 0.3 },
  "19-cachorro": { method: "color", uncertain: false, coverage: 0.18 },
  "20-peixe": { method: "color", uncertain: false, coverage: 0.2 },
  "21-caminhao": { method: "color", uncertain: false, coverage: 0.17 },
  "22-bicicleta-fina": { method: "color", uncertain: false, coverage: 0.23 },
  "23-aviao-cacador": { method: "color", uncertain: false, coverage: 0.16 },
  "24-aviao-de-cima": { method: "color", uncertain: false, coverage: 0.16 },
};

/** Rasteriza o caso: fundo + camadas com cobertura suave + ruído tipo JPEG (determinístico). */
export function rasterize(c: ImageCase): Raster {
  const w = c.w ?? W, h = c.h ?? H;
  const rgba = new Uint8ClampedArray(w * h * 4);
  let s = 17 + c.id.length;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5) * 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      let col = typeof c.bg === "function" ? c.bg(px, py) : c.bg;
      for (const l of c.layers) {
        const cover = Math.min(1, Math.max(0, 0.5 - l.sd(px, py)));
        if (cover <= 0) continue;
        const lc = typeof l.color === "function" ? l.color(px, py) : l.color;
        col = [col[0] * (1 - cover) + lc[0] * cover, col[1] * (1 - cover) + lc[1] * cover, col[2] * (1 - cover) + lc[2] * cover];
      }
      const i = (y * w + x) * 4;
      for (let d = 0; d < 3; d++) rgba[i + d] = col[d] + rand() * c.noise;
      rgba[i + 3] = 255;
    }
  return { rgba, w, h };
}
