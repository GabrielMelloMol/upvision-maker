// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { svgToColorRegions } from "./svgImport";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

function regions(svg: string) {
  const r = svgToColorRegions(M, svg);
  const out = r.map((x) => ({ color: x.color, area: x.cs.area() }));
  const total = M.CrossSection.union(r.map((x) => x.cs));
  const sum = out.reduce((s, x) => s + x.area, 0);
  const union = total.area();
  total.delete();
  r.forEach((x) => x.cs.delete());
  return { out, sum, union };
}

describe("svgToColorRegions", () => {
  test("pintura em camadas: o de cima recorta o de baixo, sem sobreposição nem fresta", () => {
    const { out, sum, union } = regions(
      `<svg xmlns="http://www.w3.org/2000/svg"><path fill="#2563eb" d="M0 0H100V100H0Z"/><path fill="#f00" d="M25 25H75V75H25Z"/></svg>`,
    );
    expect(out.map((x) => x.color)).toEqual(["#2563eb", "#ff0000"]);
    expect(out[0].area).toBeCloseTo(10000 - 2500, -1);
    expect(out[1].area).toBeCloseTo(2500, -1);
    expect(sum).toBeCloseTo(union, 0); // soma das partes = união: nada se sobrepõe
    expect(union).toBeCloseTo(10000, -1); // e nada faltou
  });

  test("mesma cor em vários caminhos vira uma região; cor por nome e por style", () => {
    const { out } = regions(
      `<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="black"/><rect x="20" width="10" height="10" style="fill:#000"/><rect x="40" width="10" height="10" fill="yellow"/></svg>`,
    );
    expect(out.map((x) => x.color)).toEqual(["#000000", "#ffff00"]);
    expect(out[0].area).toBeCloseTo(200, 0);
  });

  test("traço vira região da cor do traço", () => {
    const { out } = regions(`<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#fff" stroke="#000" stroke-width="4"/></svg>`);
    expect(out.map((x) => x.color).sort()).toEqual(["#000000", "#ffffff"]);
  });

  test("camadas empilhadas do vetorizador (cada uma contém a de cima) viram anéis que se encaixam", () => {
    const { out, sum, union } = regions(
      `<svg xmlns="http://www.w3.org/2000/svg"><path fill="#111111" d="M0 0H90V90H0Z"/><path fill="#222222" d="M10 10H80V80H10Z"/><path fill="#333333" d="M30 30H60V60H30Z"/></svg>`,
    );
    expect(out.map((x) => Math.round(x.area))).toEqual([8100 - 4900, 4900 - 900, 900]);
    expect(sum).toBeCloseTo(union, 0);
  });

  test("SVG sem forma: erro", () => {
    expect(() => svgToColorRegions(M, `<svg xmlns="http://www.w3.org/2000/svg"></svg>`)).toThrow(/Nenhuma forma/);
  });
});
