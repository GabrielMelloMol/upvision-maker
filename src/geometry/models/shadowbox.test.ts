import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type CS, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import { MissingInput, type ModelCtx } from "./common";
import { buildShadowbox, DEFAULT_SHADOWBOX as D, MAX_SHADOWBOX_LAYERS, type ShadowboxParams } from "./shadowbox";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const W = 100, H = 60;
const rect = (x0: number, y0: number, x1: number, y1: number): CS => M.CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]);
/** Imagem de 100 × 60 mm em faixas verticais, uma por cor (do escuro ao claro, da esquerda para a direita). */
function stripes(colors: string[]): ModelCtx {
  const sw = W / colors.length;
  const layers = colors.map((color, i) => ({ color, cs: rect(i * sw, 0, (i + 1) * sw, H) }));
  return { M, art: rect(0, 0, W, H), artLayers: layers, text: (s, h) => (s.trim() ? M.CrossSection.square([0.5 * h * s.length, h], true) : null) };
}
const build = (c: ModelCtx, p: Partial<ShadowboxParams> = {}) => buildShadowbox(c, { ...D, ...p });
const plateOf = (out: ReturnType<typeof build>, name: string) => out.models.find((m) => m.name.startsWith(name))!.parts[0];
const ordered = ["#222222", "#555555", "#999999", "#dddddd"];

describe("shadowbox em camadas (#104)", { timeout: 60_000 }, () => {
  test("uma placa por cor, numeradas do fundo à frente, cada uma de uma cor só", () => {
    const out = build(stripes(ordered));
    expect(out.models.map((m) => m.name)).toEqual(["Camada 1 de 4 (fundo)", "Camada 2 de 4", "Camada 3 de 4", "Camada 4 de 4 (frente)"]);
    out.models.forEach((m) => expect(m.parts).toHaveLength(1));
    expect(out.models.map((m) => m.parts[0].color)).toEqual(ordered);
    expect(out.warnings?.[0]).toMatch(/1 é o fundo e a 4 fica na frente.*17 mm/);
  });

  test("moldura nas medidas: largura + 2 bordas, na mesa, borda sobe espessura + profundidade", () => {
    const b = meshBounds([plateOf(build(stripes(ordered)), "Camada 1").mesh])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(W + 2 * D.border, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(H + 2 * D.border, 1);
    expect(b.min[2]).toBeCloseTo(0);
    expect(b.max[2]).toBeCloseTo(D.plate + D.gap, 2);
  });

  test("a placa da frente tem só a área da cor dela; as de trás têm mais", () => {
    const out = build(stripes(ordered));
    const v = out.models.map((m) => volume(m.parts[0].mesh));
    expect(v[0]).toBeGreaterThan(v[1]);
    expect(v[1]).toBeGreaterThan(v[2]);
    expect(v[2]).toBeGreaterThan(v[3]);
    // placa de trás: retângulo cheio × espessura + moldura × profundidade (menos cantos arredondados e o número furado)
    const corners = (4 - Math.PI) * D.border ** 2; // raio dos cantos = largura da moldura
    const digit = 0.5 * 4.8 * 4.8; // número "1" de teste: 0,5·h × h, com h = 0,6 × moldura
    const outer = (W + 2 * D.border) * (H + 2 * D.border) - corners;
    expect(v[0]).toBeCloseTo((outer - W * H - digit) * (D.plate + D.gap) + W * H * D.plate, -1);
  });

  test("profundidade e espessura mudam a altura da borda; fundo para LED fica mais fino", () => {
    const deep = meshBounds([plateOf(build(stripes(ordered), { gap: 8, plate: 2 }), "Camada 2").mesh])!;
    expect(deep.max[2]).toBeCloseTo(10, 2);
    const flat = volume(plateOf(build(stripes(ordered)), "Camada 1").mesh);
    const led = build(stripes(ordered), { led: true });
    expect(volume(plateOf(led, "Camada 1").mesh)).toBeLessThan(flat);
    expect(led.warnings?.join(" ")).toMatch(/fita de LED/);
  });

  test("ordem das cores: escura no fundo, clara no fundo ou a da imagem", () => {
    const colors = ["#999999", "#222222", "#dddddd"];
    const back = (order: ShadowboxParams["order"]) => build(stripes(colors), { order }).models[0].parts[0].color;
    expect(back("dark-back")).toBe("#222222");
    expect(back("light-back")).toBe("#dddddd");
    expect(back("image")).toBe("#999999");
  });

  test("mais de 8 cores: junta as menores e avisa", () => {
    const many = Array.from({ length: 10 }, (_, i) => `#${(i * 20 + 16).toString(16).padStart(2, "0").repeat(3)}`);
    const out = build(stripes(many));
    expect(out.models).toHaveLength(MAX_SHADOWBOX_LAYERS);
    expect(out.warnings?.join(" ")).toMatch(/2 região\(ões\) pequena\(s\)/);
  });

  test("região que não encosta na moldura ganha uma ponte e é avisada", () => {
    const ctx = stripes(["#222222", "#999999"]);
    const island = { color: "#999999", cs: rect(40, 20, 60, 40) };
    const out = build({ ...ctx, artLayers: [{ color: "#222222", cs: rect(0, 0, W, H) }, island] });
    expect(out.warnings?.join(" ")).toMatch(/1 área\(s\) soltas ganharam uma ponte fina \(1.6 mm\)/);
    // a frente = moldura + ilha de 20 × 20 + ponte de 1,6 mm até a borda (~20 mm de vão) × espessura
    const plate = volume(out.models[1].parts[0].mesh);
    const corners = (4 - Math.PI) * D.border ** 2;
    const digit = 0.5 * 4.8 * 4.8;
    const ring = (W + 2 * D.border) * (H + 2 * D.border) - corners - W * H - digit;
    const extra = plate - (ring * (D.plate + D.gap) + 20 * 20 * D.plate);
    expect(extra).toBeGreaterThan(30);
    expect(extra).toBeLessThan(50);
  });

  test("sem desenho ou com uma cor só, pede a imagem", () => {
    expect(() => build({ ...stripes(ordered), art: null })).toThrow(MissingInput);
    expect(() => build({ ...stripes(ordered), artLayers: null })).toThrow(MissingInput);
    expect(() => build(stripes(["#222222"]))).toThrow(MissingInput);
  });

  test("placas largas avisam que não cabem juntas na mesa", () => {
    expect(build(stripes(ordered), { width: 200 }).warnings?.join(" ")).toMatch(/Mesa por cor/);
    expect(build(stripes(ordered), { width: 60 }).warnings?.join(" ")).not.toMatch(/Mesa por cor/);
  });
});
