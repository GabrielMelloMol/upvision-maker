/**
 * Texturas do Texturizador (#222): cada uma é uma função de altura h(x, y) ∈ [0, 1] sobre um ladrilho de 1 × 1
 * (o app multiplica pelo tamanho da textura em mm). Todas são determinísticas (sem sorteio) e contínuas nas bordas
 * do ladrilho, para a textura emendar quando repete.
 */
export type TextureId = "carbono" | "couro" | "madeira" | "granulado" | "felpudo" | "knurling" | "colmeia" | "estrias-v" | "estrias-h" | "ondas" | "pontos" | "tijolos" | "escamas" | "xadrez" | "grade" | "casca";
export type TextureDef = { id: TextureId; label: string; group: "Tecido e couro" | "Natureza" | "Técnica" | "Geométrica"; scale: number; fn: (x: number, y: number) => number };

const TAU = Math.PI * 2;
const fract = (v: number) => v - Math.floor(v);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const tri = (v: number) => 1 - Math.abs(fract(v) * 2 - 1); // onda triangular 0..1
const hash = (ix: number, iy: number, seed = 0) => {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Ruído de valor suave. */
const noise = (x: number, y: number, seed = 0) => {
  const [ix, iy] = [Math.floor(x), Math.floor(y)];
  const [fx, fy] = [smooth(0, 1, x - ix), smooth(0, 1, y - iy)];
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
const fbm = (x: number, y: number, octaves: number, seed = 0) => {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * 2 ** o, y * 2 ** o, seed + o);
    norm += amp;
    amp /= 2;
  }
  return sum / norm;
};
/** Voronoi: distância ao ponto mais perto (F1) e à segunda (F2), em células de 1. */
function voronoi(x: number, y: number): [number, number] {
  const [ix, iy] = [Math.floor(x), Math.floor(y)];
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const [cx, cy] = [ix + i + hash(ix + i, iy + j, 3), iy + j + hash(ix + i, iy + j, 7)];
      const d = Math.hypot(x - cx, y - cy);
      if (d < f1) [f1, f2] = [d, f1];
      else if (d < f2) f2 = d;
    }
  return [f1, f2];
}

export const TEXTURES: TextureDef[] = [
  {
    id: "carbono",
    label: "Fibra de carbono",
    group: "Tecido e couro",
    scale: 6,
    fn: (x, y) => {
      // sarja 2×2: cada fio sobe e desce por cima de dois, deslocando uma casa por linha
      const [u, v] = [x * 4, y * 4];
      const over = (Math.floor(u) + Math.floor(v)) % 4 < 2;
      const strand = over ? 0.5 + 0.5 * Math.sin(Math.PI * fract(u)) : 0.5 + 0.5 * Math.sin(Math.PI * fract(v));
      return 0.25 + 0.75 * strand * (over ? 1 : 0.7);
    },
  },
  { id: "couro", label: "Couro", group: "Tecido e couro", scale: 7, fn: (x, y) => { const [f1, f2] = voronoi(x * 3, y * 3); return smooth(0, 0.35, f2 - f1) * (0.8 + 0.2 * noise(x * 20, y * 20)); } },
  { id: "madeira", label: "Madeira", group: "Natureza", scale: 12, fn: (x, y) => { const d = x * 6 + 1.5 * fbm(x * 2, y * 5, 3); return 0.55 * tri(d) + 0.45 * fbm(x * 3, y * 60, 2); } },
  { id: "granulado", label: "Granulado fino", group: "Natureza", scale: 3, fn: (x, y) => fbm(x * 8, y * 8, 3, 11) },
  { id: "felpudo", label: "Felpudo (fuzzy)", group: "Natureza", scale: 3, fn: (x, y) => 0.4 * noise(x * 10, y * 10, 5) + 0.35 * noise(x * 20, y * 20, 6) + 0.25 * noise(x * 40, y * 40, 8) },
  { id: "casca", label: "Casca", group: "Natureza", scale: 14, fn: (x, y) => { const [f1, f2] = voronoi(x * 2, y * 5); return smooth(0, 0.3, f2 - f1) * (0.7 + 0.3 * fbm(x * 6, y * 12, 2)); } },
  { id: "knurling", label: "Serrilhado (knurling)", group: "Técnica", scale: 3, fn: (x, y) => Math.min(tri(x + y), tri(x - y)) },
  {
    id: "colmeia",
    label: "Colmeia",
    group: "Geométrica",
    scale: 8,
    fn: (x, y) => {
      // hexágonos de ponta para cima, 2 por ladrilho: o centro mais perto em cada uma das duas grades intercaladas
      const [X, Y] = [x * 2, y * 2];
      const R3 = 1.7320508;
      const metric = (cx: number, cy: number) => {
        const [dx, dy] = [Math.abs(X - cx), Math.abs(Y - cy)];
        return Math.max(dx, 0.5 * dx + 0.8660254 * dy); // 0,5 = borda do hexágono de lado a lado 1
      };
      const a = metric(Math.round(X), Math.round(Y / R3) * R3);
      const b = metric(Math.round(X - 0.5) + 0.5, (Math.round(Y / R3 - 0.5) + 0.5) * R3);
      return 1 - smooth(0.36, 0.5, Math.min(a, b));
    },
  },
  { id: "estrias-v", label: "Estrias verticais", group: "Técnica", scale: 3, fn: (x) => 0.5 + 0.5 * Math.sin(TAU * x - Math.PI / 2) },
  { id: "estrias-h", label: "Estrias horizontais", group: "Técnica", scale: 3, fn: (_, y) => 0.5 + 0.5 * Math.sin(TAU * y - Math.PI / 2) },
  { id: "ondas", label: "Ondas", group: "Geométrica", scale: 10, fn: (x, y) => 0.5 + 0.25 * Math.sin(TAU * x) + 0.25 * Math.sin(TAU * y) },
  { id: "pontos", label: "Pontos (cúpulas)", group: "Geométrica", scale: 4, fn: (x, y) => { const d = Math.hypot(fract(x) - 0.5, fract(y) - 0.5); return Math.sqrt(Math.max(0, 1 - (d / 0.42) ** 2)); } },
  {
    id: "tijolos",
    label: "Tijolos",
    group: "Geométrica",
    scale: 20,
    fn: (x, y) => {
      const row = Math.floor(y * 4);
      const [u, v] = [fract(x * 2 + (row % 2) * 0.5), fract(y * 4)];
      return smooth(0.02, 0.09, Math.min(u, 1 - u)) * smooth(0.03, 0.12, Math.min(v, 1 - v)) * (0.85 + 0.15 * noise(Math.floor(x * 2 + (row % 2) * 0.5) * 3, row * 5));
    },
  },
  { id: "escamas", label: "Escamas", group: "Natureza", scale: 12, fn: (x, y) => { const row = Math.floor(y * 3); const u = fract(x * 3 + (row % 2) * 0.5); const v = fract(y * 3); return 1 - smooth(0.45, 0.55, Math.hypot(u - 0.5, v * 1.1)) * 0.6 - 0.4 * (1 - v); } },
  { id: "xadrez", label: "Xadrez", group: "Geométrica", scale: 12, fn: (x, y) => ((Math.floor(x * 2) + Math.floor(y * 2)) % 2 === 0 ? 1 : 0) },
  { id: "grade", label: "Grade", group: "Técnica", scale: 8, fn: (x, y) => (tri(x * 4) < 0.18 || tri(y * 4) < 0.18 ? 0.1 : 1) },
];

export const textureById = (id: TextureId): TextureDef => TEXTURES.find((t) => t.id === id)!;

/** Miniatura em tons de cinza (size × size) para a galeria. */
export function thumbnail(id: TextureId, size = 64, tiles = 2): Uint8ClampedArray {
  const { fn } = textureById(id);
  const out = new Uint8ClampedArray(size * size * 4);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const g = Math.round(255 * clamp01(fn((i / size) * tiles, (j / size) * tiles)));
      out.set([g, g, g, 255], (j * size + i) * 4);
    }
  return out;
}
