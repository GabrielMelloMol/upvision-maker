import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { DEFAULT_TEXTURIZE, texturize, texturizeAll, TexturizeCancelled, type TexturizeOptions } from "./texturize";
import { volume } from "./testUtil";
import type { Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const model = (s: ReturnType<ManifoldToplevel["Manifold"]["cube"]>): Model => ({ name: "Peça", parts: [{ name: "Peça", color: "#ddd", mesh: toMesh(s) }] });
const cube = () => model(M.Manifold.cube([40, 40, 30], false));
const ball = () => model(M.Manifold.sphere(20, 64).translate([0, 0, 20]));
const opts = (p: Partial<TexturizeOptions> = {}): TexturizeOptions => ({ ...DEFAULT_TEXTURIZE, scale: 8, depth: 0.8, ...p });
const vol = (m: Model) => m.parts.reduce((s, q) => s + volume(q.mesh), 0);
const bounds = (m: Model) => meshBounds(m.parts.map((q) => q.mesh))!;

describe("texturizador de arquivo do cliente (#222)", { timeout: 120_000 }, () => {
  test("relevo para fora: a peça cresce até a altura pedida nas laterais e no topo, e a base continua lisa", () => {
    const r = texturize(M, cube(), opts());
    const b = bounds(r.model);
    expect(b.min[2]).toBeCloseTo(0, 3); // base plana protegida
    expect(b.max[2]).toBeGreaterThan(30 + 0.1);
    expect(b.max[2]).toBeLessThanOrEqual(30 + 0.8 + 1e-3);
    expect(vol(r.model)).toBeGreaterThan(40 * 40 * 30);
    expect(r.info.triangles).toBeGreaterThan(5000); // a malha foi subdividida
    expect(r.warnings).toEqual([]);
  });

  test("gravado (para dentro): nada passa do tamanho original e o volume diminui", () => {
    const r = texturize(M, cube(), opts({ direction: "in" }));
    const b = bounds(r.model);
    expect(b.max[2]).toBeLessThanOrEqual(30 + 1e-3);
    expect(b.max[0]).toBeLessThanOrEqual(40 + 1e-3);
    expect(vol(r.model)).toBeLessThan(40 * 40 * 30);
  });

  test("a base lisa não é texturizada: com a proteção desligada a base também ganha relevo", () => {
    const com = texturize(M, cube(), opts({ flatBase: true }));
    const sem = texturize(M, cube(), opts({ flatBase: false, protectOverhang: false }));
    expect(bounds(com.model).min[2]).toBeCloseTo(0, 3);
    expect(bounds(sem.model).min[2]).toBeLessThan(-0.05);
  });

  test("proteção de balanço: o hemisfério de baixo de uma esfera não ganha relevo para fora", () => {
    const protegida = texturize(M, ball(), opts({ flatBase: false }));
    expect(bounds(protegida.model).min[2]).toBeGreaterThanOrEqual(-1e-3 + 0); // a esfera de raio 20 apoiada em z = 0
    const livre = texturize(M, ball(), opts({ flatBase: false, protectOverhang: false }));
    expect(bounds(livre.model).min[2]).toBeLessThan(-0.05);
  });

  test("área pincelada: só perto da pincelada muda; sem pincelada nada muda", () => {
    const nada = texturize(M, cube(), opts({ brush: [] }));
    expect(vol(nada.model)).toBeCloseTo(40 * 40 * 30, 1);
    expect(nada.warnings.join(" ")).toMatch(/Nada pintado/);
    const um = texturize(M, cube(), opts({ brush: [{ p: [40, 20, 15], r: 8 }] }));
    expect(vol(um.model)).toBeGreaterThan(40 * 40 * 30 + 1);
    const tudo = texturize(M, cube(), opts());
    expect(vol(um.model)).toBeLessThan(vol(tudo.model) - 20);
    // longe da pincelada, o lado oposto continua exatamente em x = 0
    expect(bounds(um.model).min[0]).toBeCloseTo(0, 3);
    expect(um.info.textured).toBeGreaterThan(0);
    expect(um.info.textured).toBeLessThan(0.3);
  });

  test("só as laterais não mexe no topo; só o topo não mexe nas laterais", () => {
    const lados = bounds(texturize(M, cube(), opts({ faces: "sides" })).model);
    expect(lados.max[2]).toBeCloseTo(30, 1);
    expect(lados.max[0]).toBeGreaterThan(40.1);
    const topo = bounds(texturize(M, cube(), opts({ faces: "top" })).model);
    expect(topo.max[0]).toBeCloseTo(40, 1);
    expect(topo.max[2]).toBeGreaterThan(30.1);
  });

  test("projeção cilíndrica numa esfera e imagem/frase (grade) também funcionam", () => {
    const grid = new Float32Array(16 * 16).map((_, i) => ((i % 16 < 8) !== (Math.floor(i / 16) < 8) ? 1 : 0));
    const r = texturize(M, ball(), opts({ mapping: "cylinder", source: { kind: "grid", grid, cols: 16, rows: 16 } }));
    expect(vol(r.model)).toBeGreaterThan(vol(ball()));
  });

  test("todas as 16 texturas dão malha válida e relevo dentro da altura", () => {
    for (const id of ["carbono", "couro", "madeira", "granulado", "felpudo", "knurling", "colmeia", "estrias-v", "estrias-h", "ondas", "pontos", "tijolos", "escamas", "xadrez", "grade", "casca"] as const) {
      const r = texturize(M, cube(), opts({ source: { kind: "pattern", id }, scale: 10, depth: 0.7 }));
      const b = bounds(r.model);
      expect(b.max[0], id).toBeLessThanOrEqual(40 + 0.7 + 1e-3);
      expect(vol(r.model), id).toBeGreaterThan(40 * 40 * 30);
    }
  });

  test("avisos: textura menor que 2 linhas do bico, relevo mínimo e relevo fundo demais", () => {
    expect(texturize(M, cube(), opts({ scale: 0.7 })).warnings.join(" ")).toMatch(/duas linhas do bico/);
    expect(texturize(M, cube(), opts({ depth: 0.1 })).warnings.join(" ")).toMatch(/mal aparece/);
    expect(texturize(M, cube(), opts({ scale: 6, depth: 5 })).warnings.join(" ")).toMatch(/fundo demais/);
  });

  test("peça enorme para a textura: reduz o detalhe e avisa, sem estourar", () => {
    const grande = model(M.Manifold.cube([300, 300, 300], false));
    const r = texturize(M, grande, opts({ scale: 3 }));
    expect(r.info.triangles).toBeLessThanOrEqual(1_600_000);
    expect(r.warnings.join(" ")).toMatch(/reduzi o detalhe/);
  });

  describe("só o lado de fora por padrão (copo, caneca, vaso)", () => {
    const cup = () => model(M.Manifold.cylinder(60, 35, 35, 96).subtract(M.Manifold.cylinder(60, 32.6, 32.6, 96).translate([0, 0, 3])));
    /** Raio de cada vértice da peça texturizada, só dos que ficam na parede de dentro (raio original 32,6) ou de fora (35). */
    const radii = (m: Model) => {
      const inner: number[] = [], outer: number[] = [];
      for (const p of m.parts) for (let i = 0; i < p.mesh.positions.length; i += 3) {
        const [x, y, z] = [p.mesh.positions[i], p.mesh.positions[i + 1], p.mesh.positions[i + 2]];
        const r = Math.hypot(x, y);
        if (z > 8 && z < 55 && r > 31.5 && r < 34) inner.push(r);
        else if (z > 8 && z < 55 && r >= 34) outer.push(r);
      }
      return { inner, outer };
    };

    test("padrão: o relevo vai só por fora; a parede de dentro continua lisa em 32,6 mm", () => {
      const { inner, outer } = radii(texturize(M, cup(), opts({ scale: 6, depth: 0.7 })).model);
      expect(Math.max(...outer)).toBeGreaterThan(35.3); // por fora tem relevo
      expect(Math.max(...inner.map((r) => Math.abs(r - 32.6)))).toBeLessThan(0.05); // por dentro nada
    });

    test("com 'texturizar por dentro também' a parede de dentro ganha relevo", () => {
      const { inner } = radii(texturize(M, cup(), opts({ scale: 6, depth: 0.7, interior: true })).model);
      expect(Math.max(...inner.map((r) => Math.abs(r - 32.6)))).toBeGreaterThan(0.3);
    });

    test("peça maciça não muda: o lado de fora é a superfície toda", () => {
      const a = texturize(M, cube(), opts({ interior: false }));
      const b = texturize(M, cube(), opts({ interior: true }));
      expect(vol(a.model)).toBeCloseTo(vol(b.model), 0);
    });
  });

  describe("progresso e cancelamento", () => {
    test("o progresso só cresce, passa pelas etapas e termina em 1", () => {
      const seen: [number, string][] = [];
      texturizeAll(M, [cube()], opts(), { progress: (f, st) => seen.push([f, st]) });
      expect(seen.length).toBeGreaterThan(5);
      for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThanOrEqual(seen[i - 1][0] - 1e-9);
      expect(seen[seen.length - 1]).toEqual([1, "Pronto"]);
      expect(seen.map((x) => x[1])).toEqual(expect.arrayContaining(["Subdividindo a malha", "Separando o lado de fora do de dentro", "Aplicando o relevo"]));
    });

    test("cancelar no meio interrompe com TexturizeCancelled", () => {
      let calls = 0;
      expect(() => texturizeAll(M, [cube()], opts(), { cancelled: () => ++calls > 3 })).toThrow(TexturizeCancelled);
    });

    test("vários objetos: o progresso cobre todos (de 0 a 1)", () => {
      const seen: number[] = [];
      texturizeAll(M, [cube(), ball()], opts(), { progress: (f) => seen.push(f) });
      expect(Math.max(...seen)).toBeCloseTo(1, 5);
      expect(Math.min(...seen)).toBeLessThan(0.1);
    });
  });
});
