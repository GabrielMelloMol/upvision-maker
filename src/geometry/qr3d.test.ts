import { beforeAll, describe, expect, test } from "vitest";
import { qrMatrix } from "../domain/qr";
import { meshBounds } from "./bounds";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { heightFraction, MIN_HEIGHT_FRACTION, qrModel } from "./qr3d";
import { readTopView, topViewImage } from "./qrScan";
import { modelSize, volume } from "./testUtil";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

describe("qrModel", () => {
  test("placa + QR em relevo, cada um numa parte; volumes batem com os módulos", async () => {
    const M = await getManifold();
    const m = qrMatrix("https://upvision.com.br");
    const n = m.length;
    const dark = m.flat().filter(Boolean).length;
    const { model, moduleMm, warnings } = qrModel(M, m, { sizeMm: 50, baseMm: 2, reliefMm: 1, quiet: 2 });
    expect(model.parts.map((p) => p.name)).toEqual(["Base", "QR"]);
    expect(moduleMm).toBeCloseTo(50 / (n + 4), 6);
    const [x, y, z] = modelSize(model);
    expect(x).toBeCloseTo(50, 3);
    expect(y).toBeCloseTo(50, 3);
    expect(z).toBeCloseTo(3, 3);
    expect(volume(model.parts[1].mesh)).toBeCloseTo(dark * moduleMm ** 2 * 1, 1);
    expect(warnings).toEqual([]);
  });

  test("módulo pequeno demais gera aviso de leitura", async () => {
    const M = await getManifold();
    const { warnings } = qrModel(M, qrMatrix("x".repeat(200)), { sizeMm: 20, baseMm: 2, reliefMm: 1, quiet: 2 });
    expect(warnings[0]).toMatch(/módulo/);
  });

  test("QR fica em cima da base (z de base até base+relevo)", async () => {
    const M = await getManifold();
    const { model } = qrModel(M, qrMatrix("a"), { sizeMm: 30, baseMm: 1.6, reliefMm: 0.8, quiet: 2 });
    const zs = model.parts[1].mesh.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(1.6, 4);
    expect(Math.max(...zs)).toBeCloseTo(2.4, 4);
  });
});

describe("QR escultural (#114)", { timeout: 60_000 }, () => {
  const TEXT = "https://upvision.app/qr-escultural?id=42";
  const STYLES = ["flat", "pyramid", "steps", "waves"] as const;
  const build = (style: (typeof STYLES)[number], extra: object = {}) => qrModel(M, qrMatrix(TEXT), { sizeMm: 60, baseMm: 2, reliefMm: 4, quiet: 2, style, ...extra });
  const zTops = (m: { positions: Float32Array }) => {
    const tops = new Set<number>();
    for (let i = 2; i < m.positions.length; i += 3) tops.add(Math.round(m.positions[i] * 100) / 100);
    return [...tops].sort((a, b) => a - b);
  };

  test.each(STYLES)("%s: a vista de cima ainda lê o texto do QR", (style) => {
    const r = build(style);
    expect(readTopView(M, r.model.parts[1].mesh, 60)).toBe(TEXT);
  });

  test("controle: a vista de cima da placa lisa (sem código) não lê nada", () => {
    expect(readTopView(M, build("flat").model.parts[0].mesh, 60)).toBeNull();
  });

  test("a vista de cima dos estilos esculpidos é idêntica à do plano (mesma pegada dos módulos)", () => {
    const flat = topViewImage(M, build("flat").model.parts[1].mesh, 60, 6);
    for (const style of ["pyramid", "steps", "waves"] as const) {
      const img = topViewImage(M, build(style).model.parts[1].mesh, 60, 6);
      expect(img.rgba).toEqual(flat.rgba);
    }
  });

  test("plano: um só degrau, com o relevo inteiro", () => {
    const tops = zTops(build("flat").model.parts[1].mesh);
    expect(tops).toEqual([expect.closeTo(2, 5), expect.closeTo(6, 5)]);
  });

  test("pirâmide: o centro é o ponto mais alto (relevo pleno) e a borda a altura mínima", () => {
    const r = build("pyramid");
    const m = r.model.parts[1].mesh;
    const b = meshBounds([m])!;
    expect(b.max[2]).toBeCloseTo(2 + 4, 4); // base + relevo
    const tops = zTops(m);
    expect(tops.length).toBeGreaterThan(3);
    expect(tops[1]).toBeGreaterThanOrEqual(2 + 4 * MIN_HEIGHT_FRACTION - 0.01); // nada abaixo da fração mínima
    // altura em função da distância: módulo do centro > módulo da borda
    expect(heightFraction("pyramid", 20, 20, 41)).toBeGreaterThan(heightFraction("pyramid", 0, 20, 41));
    expect(heightFraction("pyramid", 20, 20, 41)).toBeCloseTo(1, 1);
  });

  test("degraus: tantos níveis quantos anéis, e o número de anéis muda a escultura", () => {
    const levels = (steps: number) => zTops(build("steps", { steps }).model.parts[1].mesh).length - 1; // sem a face da base
    expect(levels(3)).toBeLessThanOrEqual(3);
    expect(levels(6)).toBeGreaterThan(levels(3));
    expect(heightFraction("steps", 20, 20, 41, { steps: 4 })).toBeCloseTo(1);
    expect(heightFraction("steps", 0, 20, 41, { steps: 4 })).toBeCloseTo(MIN_HEIGHT_FRACTION);
  });

  test("ondas: variam suavemente e a variação muda com a semente; o contraste de leitura se mantém", () => {
    const a = build("waves", { seed: 1 }).model.parts[1].mesh, b = build("waves", { seed: 7 }).model.parts[1].mesh;
    expect(zTops(a).length).toBeGreaterThan(3);
    expect(Array.from(a.positions.slice(0, 600))).not.toEqual(Array.from(b.positions.slice(0, 600)));
    // vizinhos próximos têm alturas parecidas (ruído suave)
    const h = (c: number) => heightFraction("waves", c, 10, 41, { seed: 3 });
    for (let c = 0; c < 39; c++) expect(Math.abs(h(c + 1) - h(c))).toBeLessThan(0.25);
    expect(readTopView(M, b, 60)).toBe(TEXT);
  });

  test("esculpido avisa para testar com o celular; o plano não", () => {
    expect(build("flat").warnings.join(" ")).not.toMatch(/esculpido/);
    expect(build("pyramid").warnings.join(" ")).toMatch(/Código esculpido/);
  });

  test("a base não muda de estilo para estilo (placa, cantos e cor)", () => {
    const base = (s: (typeof STYLES)[number]) => volume(build(s).model.parts[0].mesh);
    expect(base("pyramid")).toBeCloseTo(base("flat"), 3);
  });
});
