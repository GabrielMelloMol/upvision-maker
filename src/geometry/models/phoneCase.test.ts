import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import type { Mesh } from "../types";
import type { ModelCtx } from "./common";
import { buildPhoneCase, DEFAULT_PHONE_CASE, parseButtons, type PhoneCaseParams } from "./phoneCase";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});
const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const cas = (p: Partial<PhoneCaseParams> = {}) => buildPhoneCase(ctx(), { ...DEFAULT_PHONE_CASE, ...p });
const solid = (m: Mesh) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const mesh = (o: ReturnType<typeof cas>) => o.models[0].parts[0].mesh;
const vol = (m: Mesh) => { const s = solid(m); const v = s.volume(); s.delete(); return v; };
const P = DEFAULT_PHONE_CASE;
/** O aparelho: bloco de cantos arredondados, com o centro na origem e as costas em z = floor (como no bolso). */
function phone(p: PhoneCaseParams, thick: number) {
  const cs = M.CrossSection.square([p.phoneW, p.phoneL], true).offset(-p.cornerR, "Round").offset(p.cornerR, "Round");
  const out = cs.extrude(thick).translate([0, 0, p.floor + p.clearance]);
  cs.delete();
  return out;
}

describe("leitura dos recortes de botão (#232)", () => {
  test("direita/esquerda ou right/left, posição e comprimento; o resto volta como erro", () => {
    expect(parseButtons("direita, 40, 22\nlixo, 1, 2")).toEqual({ cuts: [{ side: "right", pos: 40, len: 22 }], bad: ["lixo, 1, 2"] });
    expect(parseButtons("cima, 3, 4; esquerda, 10, 0").bad).toHaveLength(2);
    expect(parseButtons("esquerda, 28.5, 28").cuts).toEqual([{ side: "left", pos: 28.5, len: 28 }]);
  });
});

describe("capa de celular em TPU (#232)", { timeout: 60_000 }, () => {
  test("o aparelho cabe no bolso (com a folga) e só a borda da frente encosta nele; um aparelho maior bate nas paredes", () => {
    const c = solid(mesh(cas()));
    const body = phone(P, P.phoneT - P.lip - 0.2); // sem a faixa coberta pela borda
    expect(c.intersect(body).volume()).toBeLessThan(0.01);
    const full = phone(P, P.phoneT);
    const hit = c.intersect(full).volume();
    expect(hit).toBeGreaterThan(5); // a borda cobre a frente
    expect(hit).toBeLessThan(1500);
    const bigger = phone({ ...P, phoneW: P.phoneW + 1.2, phoneL: P.phoneL + 1.2 }, P.phoneT - P.lip - 0.2);
    expect(c.intersect(bigger).volume()).toBeGreaterThan(5);
    [c, body, full, bigger].forEach((o) => o.delete());
  });

  test("a capa tem a parede, o fundo e a altura pedidos e sai de costas na mesa", () => {
    const b = meshBounds([mesh(cas())])!;
    expect(b.min[2]).toBeCloseTo(0, 3);
    expect(b.max[2]).toBeCloseTo(P.floor + P.phoneT + P.clearance, 2);
    expect(b.max[0] - b.min[0]).toBeCloseTo(P.phoneW + 2 * P.clearance + 2 * P.wall, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(P.phoneL + 2 * P.clearance + 2 * P.wall, 1);
    const s = solid(mesh(cas({ pattern: "smooth" })));
    expect(s.decompose().length).toBe(1);
    s.delete();
  });

  test("câmera: o recorte atravessa o fundo no canto de cima à esquerda visto de trás; o resto do fundo é maciço", () => {
    const c = solid(mesh(cas({ pattern: "smooth" })));
    const cx = P.phoneW / 2 - P.camX - P.camW / 2, cy = P.phoneL / 2 - P.camY - P.camH / 2;
    const at = (x: number, y: number) => M.Manifold.cube([2, 2, 0.8], true).translate([x, y, P.floor / 2]);
    expect(c.intersect(at(cx, cy)).volume()).toBeLessThan(0.001); // aberto
    expect(c.intersect(at(-cx, cy)).volume()).toBeGreaterThan(3); // do outro lado é fundo
    expect(c.intersect(at(0, -cy)).volume()).toBeGreaterThan(3);
    c.delete();
  });

  test("botões: o recorte abre a lateral na posição pedida (direita = lado + de frente); fora dele a parede é maciça", () => {
    const c = solid(mesh(cas({ pattern: "smooth" })));
    const xR = P.phoneW / 2 + P.clearance + P.wall / 2, zMid = P.floor + P.phoneT / 2 + 1;
    const at = (x: number, posTop: number) => M.Manifold.cube([0.8, 1, 1], true).translate([x, P.phoneL / 2 - posTop, zMid]);
    expect(c.intersect(at(xR, 50)).volume()).toBeLessThan(0.001); // botão da direita (40 a 62 do topo)
    expect(c.intersect(at(xR, 90)).volume()).toBeGreaterThan(0.4); // abaixo do recorte: parede
    expect(c.intersect(at(-xR, 50)).volume()).toBeLessThan(0.001); // esquerda: recorte de 28 a 56
    expect(c.intersect(at(-xR, 90)).volume()).toBeGreaterThan(0.4);
    c.delete();
  });

  test("desenho e nome gravados nas costas pela mesa, rasos (o fundo não fura); liso não tem", () => {
    const smooth = vol(mesh(cas({ pattern: "smooth" })));
    expect(vol(mesh(cas({ pattern: "hex" })))).toBeLessThan(smooth - 20);
    expect(vol(mesh(cas({ pattern: "cross" })))).toBeLessThan(smooth - 10);
    expect(vol(mesh(cas({ pattern: "smooth", name: "Ana" })))).toBeLessThan(smooth - 3);
    const s = solid(mesh(cas({ pattern: "hex" })));
    const slice = s.slice(P.floor - 0.3); // acima do rebaixo: o fundo está inteiro (menos a câmera)
    const full = solid(mesh(cas({ pattern: "smooth" })));
    const slice2 = full.slice(P.floor - 0.3);
    expect(slice.area()).toBeCloseTo(slice2.area(), 0);
    [s, slice, full, slice2].forEach((o) => o.delete());
  });

  test("peça de teste: só 25 mm do canto de baixo, uma peça, com o mesmo bolso e a borda; menor que a capa", () => {
    const t = cas({ print: "test" });
    expect(t.models[0].name).toBe("Peça de teste");
    const b = meshBounds([mesh(t)])!;
    expect(b.max[1] - b.min[1]).toBeCloseTo(25, 0);
    expect(b.max[0] - b.min[0]).toBeCloseTo(P.phoneW + 2 * P.clearance + 2 * P.wall, 1);
    const s = solid(mesh(t));
    expect(s.decompose().length).toBe(1);
    s.delete();
    expect(vol(mesh(t))).toBeLessThan(vol(mesh(cas())) * 0.4);
    expect(t.warnings!.join(" ")).toMatch(/Peça de teste: experimente no aparelho/);
  });

  test("o aviso de conferir no aparelho sempre aparece na capa; avisos de folga grande, câmera fora e botão ruim", () => {
    expect(cas().warnings!.join(" ")).toMatch(/Confira as medidas no seu aparelho.*imprima antes a peça de teste.*aproximadas/);
    expect(cas({ clearance: 0.5 }).warnings!.join(" ")).toMatch(/Folga grande para TPU/);
    expect(cas({ camX: 60 }).warnings!.join(" ")).toMatch(/recorte da câmera sai/);
    expect(cas({ buttons: "direita, 40, 22\nlixo" }).warnings!.join(" ")).toMatch(/Recorte de botão ignorado/);
    expect(cas({ buttons: "direita, 140, 22" }).warnings!.join(" ")).toMatch(/passa do comprimento/);
  });
});
