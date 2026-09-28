import { morph } from "./raster";

/** Desfoque de caixa separável (raio r) em luminância 0–255. */
export function boxBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return src;
  const pass = (a: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(a.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          s += a[yy * w + xx];
          n++;
        }
        out[y * w + x] = Math.round(s / n);
      }
    }
    return out;
  };
  return pass(pass(src, true), false);
}

export const closeMask = (m: Uint8Array, w: number, h: number, r: number) => morph(morph(m, w, h, r, false), w, h, r, true);

type Comps = { labels: Int32Array; sizes: number[]; border: boolean[] };

/** Componentes conexos (4-vizinhança) dos pixels com valor `v`. */
function components(m: Uint8Array, w: number, h: number, v: 0 | 1): Comps {
  const labels = new Int32Array(m.length).fill(-1);
  const sizes: number[] = [];
  const border: boolean[] = [];
  const stack: number[] = [];
  for (let i = 0; i < m.length; i++) {
    if (m[i] !== v || labels[i] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    let touches = false;
    labels[i] = id;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      size++;
      const x = j % w, y = (j - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
      for (const n of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1]) {
        if (n >= 0 && m[n] === v && labels[n] < 0) {
          labels[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
    border.push(touches);
  }
  return { labels, sizes, border };
}

/** Remove ilhas da forma menores que `minPx` e fecha furos internos menores que `minPx`. */
export function removeSmall(m: Uint8Array, w: number, h: number, minPx: number): Uint8Array {
  const out = m.slice();
  const fg = components(m, w, h, 1);
  for (let i = 0; i < m.length; i++) if (m[i] && fg.sizes[fg.labels[i]] < minPx) out[i] = 0;
  const bg = components(out, w, h, 0);
  for (let i = 0; i < m.length; i++) if (!out[i] && !bg.border[bg.labels[i]] && bg.sizes[bg.labels[i]] < minPx) out[i] = 1;
  return out;
}

export function largestComponent(m: Uint8Array, w: number, h: number): Uint8Array {
  const c = components(m, w, h, 1);
  if (!c.sizes.length) return m.slice();
  const best = c.sizes.indexOf(Math.max(...c.sizes));
  return Uint8Array.from(c.labels, (l) => (l === best ? 1 : 0));
}

/** Preenche tudo que é fundo mas não se liga à borda da imagem. */
export function fillHoles(m: Uint8Array, w: number, h: number): Uint8Array {
  const bg = components(m, w, h, 0);
  return Uint8Array.from(m, (v, i) => (v || !bg.border[bg.labels[i]] ? 1 : 0));
}

/** Contorno liso: desfoca a máscara (2 passes ≈ gaussiano) e corta em 50%. */
export function smoothMask(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return m.slice();
  const b = boxBlur(boxBlur(Uint8Array.from(m, (v) => v * 255), w, h, r), w, h, r);
  return Uint8Array.from(b, (v) => (v >= 128 ? 1 : 0));
}

/** Engrossa os trechos finos: dilata só os pixels marcados como finos e junta com a forma. */
export function thicken(m: Uint8Array, thin: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const grown = morph(thin, w, h, r, false);
  return Uint8Array.from(m, (v, i) => v | grown[i]);
}
