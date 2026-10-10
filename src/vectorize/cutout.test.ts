import { gunzipSync } from "fflate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { colorCutout, cutout, maskOutline, type Segmenter } from "./cutout";
import { scaleFactor } from "./raster";
import { loadFixture } from "./testFixtures";

/* Fotos sintéticas (determinísticas) com a máscara verdadeira ao lado: o recorte é medido pela interseção sobre a união (IoU). */
type Scene = { rgba: Uint8ClampedArray; truth: Uint8Array; w: number; h: number };
type Rgb = [number, number, number];

/** Avião de lado (fuselagem, asa, cauda): um objeto comprido, parecido com o do Kit card. */
const plane = (w: number, h: number) => (x: number, y: number) => {
  const u = (x - w * 0.5) / (w * 0.36), v = (y - h * 0.5) / (h * 0.09);
  const fuselage = u * u + v * v <= 1;
  const wing = x > w * 0.42 && x < w * 0.62 && Math.abs(y - h * 0.5) < (x - w * 0.42) * 0.9 && Math.abs(y - h * 0.5) < h * 0.26;
  const tail = x > w * 0.17 && x < w * 0.26 && y < h * 0.5 && y > h * 0.5 - (w * 0.26 - x) * 1.1 && y > h * 0.3;
  return fuselage || wing || tail;
};
/** Pessoa estilizada (cabeça e corpo). */
const person = (w: number, h: number) => (x: number, y: number) =>
  Math.hypot(x - w * 0.5, y - h * 0.28) < h * 0.12 || (Math.abs(x - w * 0.5) < w * 0.17 && y > h * 0.4 && y < h * 0.92);

function scene(w: number, h: number, bg: (x: number, y: number) => Rgb, shape: (x: number, y: number) => boolean, color: Rgb, noise = 0, seed = 11): Scene {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const truth = new Uint8Array(w * h);
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5) * 2;
  const SUB = 4; // bordas suaves como as de uma foto: cada pixel mistura objeto e fundo pela fração coberta
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let cover = 0;
      for (let sy = 0; sy < SUB; sy++) for (let sx = 0; sx < SUB; sx++) if (shape(x + (sx + 0.5) / SUB, y + (sy + 0.5) / SUB)) cover++;
      const f = cover / (SUB * SUB);
      truth[y * w + x] = shape(x + 0.5, y + 0.5) ? 1 : 0;
      const b = bg(x, y);
      for (let d = 0; d < 3; d++) rgba[(y * w + x) * 4 + d] = b[d] * (1 - f) + color[d] * f + rand() * noise;
      rgba[(y * w + x) * 4 + 3] = 255;
    }
  return { rgba, truth, w, h };
}

const iou = (a: Uint8Array, b: Uint8Array) => {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) {
    inter += a[i] & b[i];
    uni += a[i] | b[i];
  }
  return uni ? inter / uni : 1;
};
const W = 360, H = 240;
const flat = (c: Rgb): ((x: number, y: number) => Rgb) => () => c;
/** Fundo com degradê diagonal e vinheta (céu de foto de avião). */
const sky = (w: number, h: number) => (x: number, y: number): Rgb => {
  const t = (x / w + y / h) / 2, d = Math.hypot(x / w - 0.5, y / h - 0.5);
  return [205 - 70 * t - 40 * d * d * 4, 218 - 62 * t - 40 * d * d * 4, 238 - 50 * t - 30 * d * d * 4];
};
/** Fundo "bagunçado": xadrez fino colorido (não é liso nem degradê). */
const busy = (x: number, y: number): Rgb => ((Math.floor(x / 5) + Math.floor(y / 5)) % 2 ? [190, 120, 60] : [40, 150, 170]);

describe("recorte do fundo pela cor (fundo liso ou quase liso)", () => {
  test("objeto em fundo liso: máscara quase igual à verdadeira, sem incerteza", () => {
    const s = scene(W, H, flat([236, 236, 232]), plane(W, H), [70, 80, 96], 3);
    const r = colorCutout(s.rgba, s.w, s.h);
    expect(iou(r.mask, s.truth)).toBeGreaterThan(0.96);
    expect(r.method).toBe("color");
    expect(r.uncertain).toBe(false);
    expect(r.warning).toBeNull();
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  test("fundo com degradê e vinheta: o fundo sai por ajuste da superfície, não por uma cor só", () => {
    const s = scene(W, H, sky(W, H), plane(W, H), [60, 70, 70], 3);
    const r = colorCutout(s.rgba, s.w, s.h);
    expect(iou(r.mask, s.truth)).toBeGreaterThan(0.93);
    expect(r.uncertain).toBe(false);
  });

  test("fundo liso com ruído de JPEG ainda recorta bem", () => {
    const s = scene(W, H, flat([200, 205, 210]), plane(W, H), [110, 60, 50], 14);
    const r = colorCutout(s.rgba, s.w, s.h);
    expect(iou(r.mask, s.truth)).toBeGreaterThan(0.93);
  });

  test("objeto com sombra suave embaixo: o objeto é achado e a sombra não vira parte dele", () => {
    const base = flat([236, 236, 232]);
    const shadowed = (x: number, y: number): Rgb => {
      const d = Math.hypot((x - W * 0.5) / (W * 0.34), (y - H * 0.64) / (H * 0.07));
      const k = d < 1 ? 1 - 0.16 * (1 - d) : 1; // sombra de até 16% mais escura
      const b = base(x, y);
      return [b[0] * k, b[1] * k, b[2] * k];
    };
    const s = scene(W, H, shadowed, plane(W, H), [70, 80, 96], 3);
    const r = colorCutout(s.rgba, s.w, s.h);
    expect(iou(r.mask, s.truth)).toBeGreaterThan(0.93);
  });

  test("objeto claro em fundo claro de cor bem diferente (tons iguais, matiz diferente) é achado", () => {
    const s = scene(W, H, flat([245, 240, 225]), plane(W, H), [225, 235, 250], 2);
    expect(iou(colorCutout(s.rgba, s.w, s.h).mask, s.truth)).toBeGreaterThan(0.9);
  });

  test("só o maior objeto fica; ponto de sujeira solto some e furo interno de fundo é preenchido", () => {
    const base = plane(W, H);
    const shape = (x: number, y: number) => (base(x, y) && Math.hypot(x - W * 0.5, y - H * 0.5) > 7) || Math.hypot(x - 20, y - 20) < 4;
    const s = scene(W, H, flat([240, 240, 240]), shape, [50, 60, 80], 2);
    const r = colorCutout(s.rgba, s.w, s.h);
    expect(r.mask[22 * W + 20]).toBe(0); // a sujeira solta
    expect(r.mask[(H / 2) * W + W / 2]).toBe(1); // o furo no meio do avião
  });

  test("objeto com a cor do fundo: sem contraste, o recorte avisa que é incerto", () => {
    const s = scene(W, H, flat([120, 130, 140]), plane(W, H), [124, 133, 142], 2);
    const r = colorCutout(s.rgba, s.w, s.h);
    expect(r.uncertain).toBe(true);
    expect(r.warning).toMatch(/recorte/i);
  });

  test("fundo bagunçado (não é liso): incerto, com a dica de usar uma foto de fundo liso", () => {
    const s = scene(W, H, busy, plane(W, H), [250, 250, 250], 2);
    const r = colorCutout(s.rgba, s.w, s.h);
    expect(r.uncertain).toBe(true);
    expect(r.warning).toMatch(/fundo/i);
  });

  test("foto de fundo liso sem nenhum objeto: não inventa recorte e avisa", () => {
    const s = scene(W, H, flat([230, 230, 230]), () => false, [0, 0, 0], 2);
    const r = colorCutout(s.rgba, s.w, s.h);
    expect(r.uncertain).toBe(true);
    expect(r.coverage).toBeLessThan(0.02);
  });

  test("objeto cortado pela borda da foto avisa", () => {
    const shape = (x: number, y: number) => x > W * 0.55 && y > H * 0.2 && y < H * 0.8;
    const s = scene(W, H, flat([235, 235, 235]), shape, [60, 90, 60], 2);
    const r = colorCutout(s.rgba, s.w, s.h);
    expect(r.warning).toMatch(/borda/i);
  });

  test("devolve área, caixa e cobertura coerentes com a máscara", () => {
    const s = scene(W, H, flat([236, 236, 232]), plane(W, H), [70, 80, 96], 2);
    const r = colorCutout(s.rgba, s.w, s.h);
    const area = r.mask.reduce((a, v) => a + v, 0);
    expect(r.coverage).toBeCloseTo(area / (W * H), 5);
    expect(r.bbox.x1 - r.bbox.x0).toBeGreaterThan(W * 0.5);
    expect(r.bbox.y1 - r.bbox.y0).toBeGreaterThan(H * 0.2);
  });
});

describe("recorte automático: cor primeiro, Silhueta (MediaPipe) quando o fundo não é liso", () => {
  const trueSeg = (truth: Uint8Array, noisy = false): Segmenter => async () => {
    const m = truth.slice();
    if (noisy) {
      for (let i = 0; i < m.length; i += 977) m[i] = 1 - m[i]; // erros espalhados de uma IA
      for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) m[y * W + x] = 1; // um respingo longe do objeto
    }
    return m;
  };

  test("pessoa em fundo bagunçado: usa a Silhueta de pessoa e a máscara limpa fica perto da verdadeira", async () => {
    const s = scene(W, H, busy, person(W, H), [120, 80, 70], 2);
    const seg = vi.fn(trueSeg(s.truth, true));
    const r = await cutout(s.rgba, s.w, s.h, { segment: seg });
    expect(seg).toHaveBeenCalledWith(expect.anything(), W, H, "person");
    expect(r.method).toBe("person");
    expect(iou(r.mask, s.truth)).toBeGreaterThan(0.95);
    expect(r.uncertain).toBe(false);
  });

  test("bicho, avião ou carro (sem pessoa na foto) caem no DeepLab", async () => {
    const s = scene(W, H, busy, plane(W, H), [250, 250, 250], 2);
    const seg = vi.fn<Segmenter>(async (_r, _w, _h, subject) => (subject === "person" ? new Uint8Array(W * H) : s.truth));
    const r = await cutout(s.rgba, s.w, s.h, { segment: seg });
    expect(seg.mock.calls.map((c) => c[3])).toEqual(["person", "pet"]);
    expect(r.method).toBe("deeplab");
    expect(iou(r.mask, s.truth)).toBeGreaterThan(0.95);
  });

  test("fundo liso: nem chama a IA (rápido e offline)", async () => {
    const s = scene(W, H, flat([236, 236, 232]), plane(W, H), [70, 80, 96], 2);
    const seg = vi.fn<Segmenter>();
    const r = await cutout(s.rgba, s.w, s.h, { segment: seg });
    expect(seg).not.toHaveBeenCalled();
    expect(r.method).toBe("color");
    expect(iou(r.mask, s.truth)).toBeGreaterThan(0.96);
  });

  test("a pessoa pedida à força usa a IA mesmo em fundo liso", async () => {
    const s = scene(W, H, flat([236, 236, 232]), person(W, H), [120, 80, 70], 2);
    const seg = vi.fn(trueSeg(s.truth));
    const r = await cutout(s.rgba, s.w, s.h, { subject: "person", segment: seg });
    expect(r.method).toBe("person");
    const plain = await cutout(s.rgba, s.w, s.h, { subject: "plain", segment: seg });
    expect(plain.method).toBe("color");
  });

  test("a IA falha (modelo não carregou): cai na cor, incerto e dizendo o porquê", async () => {
    const s = scene(W, H, busy, plane(W, H), [250, 250, 250], 2);
    const r = await cutout(s.rgba, s.w, s.h, { segment: async () => { throw new Error("sem WASM"); } });
    expect(r.method).toBe("color");
    expect(r.uncertain).toBe(true);
    expect(r.warning).toMatch(/inteligência|IA|silhueta/i);
  });

  test("a IA não acha ninguém: cai na cor e avisa", async () => {
    const s = scene(W, H, busy, plane(W, H), [250, 250, 250], 2);
    const r = await cutout(s.rgba, s.w, s.h, { segment: async () => new Uint8Array(W * H) });
    expect(r.method).toBe("color");
    expect(r.uncertain).toBe(true);
  });

  test("máscara da IA que cobre a foto toda é suspeita: incerta", async () => {
    const s = scene(W, H, busy, plane(W, H), [250, 250, 250], 2);
    const r = await cutout(s.rgba, s.w, s.h, { segment: async () => new Uint8Array(W * H).fill(1) });
    expect(r.uncertain).toBe(true);
  });
});

describe("contorno do recorte", () => {
  test("contorno externo exato: a área dele é a da máscara e acompanha a forma", () => {
    const m = new Uint8Array(40 * 30);
    for (let y = 5; y < 25; y++) for (let x = 8; x < 33; x++) m[y * 40 + x] = 1;
    const [ring, ...others] = maskOutline(m, 40, 30, 0);
    expect(others).toHaveLength(0);
    const shoelace = Math.abs(ring.reduce((a, p, i) => a + (p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1]), 0)) / 2;
    expect(shoelace).toBe(25 * 20);
    expect(ring).toHaveLength(4); // retângulo: só os 4 cantos
  });

  test("a simplificação mantém a área perto da real e reduz os pontos", () => {
    const s = scene(W, H, flat([236, 236, 232]), plane(W, H), [70, 80, 96], 0);
    const exact = maskOutline(s.truth, W, H, 0)[0];
    const simple = maskOutline(s.truth, W, H, 1.2)[0];
    const area = (r: number[][]) => Math.abs(r.reduce((a, p, i) => a + (p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1]), 0)) / 2;
    expect(simple.length).toBeLessThan(exact.length / 3);
    expect(Math.abs(area(simple) - area(exact)) / area(exact)).toBeLessThan(0.02);
  });

  test("máscara vazia não tem contorno", () => {
    expect(maskOutline(new Uint8Array(100), 10, 10, 0)).toEqual([]);
  });
});

describe("fotos de verdade (tests/fixtures)", () => {
  const raw = loadFixture("foto-pessoa.jpg");
  const photo = loadFixture("foto-pessoa.jpg", Math.round(Math.max(raw.w, raw.h) * scaleFactor(raw.w, raw.h)));
  // máscara que o MediaPipe Selfie Segmenter gerou para esta foto no app (não roda no Node; ver tests/fixtures/README.md)
  const real = gunzipSync(readFileSync(resolve(__dirname, "../../tests/fixtures/foto-pessoa.seg.gz")));

  test("retrato com fundo de cena: pela cor o recorte é incerto; com a Silhueta de pessoa fica igual à máscara da IA, limpa", async () => {
    expect(real.length).toBe(photo.w * photo.h);
    expect(colorCutout(photo.rgba, photo.w, photo.h).uncertain).toBe(true);
    const r = await cutout(photo.rgba, photo.w, photo.h, { segment: async () => real });
    expect(r.method).toBe("person");
    expect(r.uncertain).toBe(false);
    expect(iou(r.mask, real)).toBeGreaterThan(0.97); // a limpeza (maior componente, sem furos) quase não mexe numa boa máscara
    expect(r.coverage).toBeGreaterThan(0.25);
  });

  test("logo e desenho em fundo branco: a cor basta (sem chamar a IA) e acha o objeto", async () => {
    for (const name of ["logo.jpg", "desenho.jpg"]) {
      const f = loadFixture(name, 400);
      const seg = vi.fn<Segmenter>();
      const r = await cutout(f.rgba, f.w, f.h, { segment: seg });
      expect(seg, name).not.toHaveBeenCalled();
      expect(r.method).toBe("color");
      expect(r.uncertain).toBe(false);
      expect(r.coverage, name).toBeGreaterThan(0.1);
      expect(r.coverage, name).toBeLessThan(0.9);
    }
  });
});
