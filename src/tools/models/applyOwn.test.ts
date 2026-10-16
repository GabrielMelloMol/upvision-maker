// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../../geometry/bounds";
import { getManifold, type ManifoldToplevel } from "../../geometry/manifold";
import { toMesh } from "../../geometry/mesh";
import { faceAtPoint, fromFaceFrame, planarFaces, readAsciiStl, readOwnFile, readOwnObjects, toFaceFrame, wideFaces } from "../../geometry/ownModel";
import { write3mf } from "../../geometry/threemf";
import { volume } from "../../geometry/testUtil";
import type { Model } from "../../geometry/types";
import { applyOwnCurved, applyOwnDecals, OWN_MODEL_ERRORS, partAtPoint } from "./applyOwn";
import { newArtLayer, type Layer } from "./layers";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
/** Bloco 40 × 30 × 20 com o canto em (0, 0, 0). */
const block = (): Model => ({ name: "Bloco", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(M.Manifold.cube([40, 30, 20], false)) }] });
const layer = (patch: Partial<Layer> = {}): Layer => ({ ...newArtLayer(SQUARE, "quadrado", null), x: 0, y: 0, width: 10, mode: "inlay", depth: 0.6, color: "#d6262e", ...patch });

describe("faces planas e decal em modelo próprio (#113)", { timeout: 60_000 }, () => {
  test("um bloco tem 6 faces planas, todas para fora, com a área certa", () => {
    const faces = planarFaces(block());
    expect(faces).toHaveLength(6);
    expect(faces.every((f) => f.extreme)).toBe(true);
    expect(faces.map((f) => Math.round(f.area)).sort((a, b) => a - b)).toEqual([600, 600, 800, 800, 1200, 1200]);
  });

  test("clique: o ponto e a normal do acerto escolhem a face certa", () => {
    const b = block();
    const faces = planarFaces(b);
    expect(faceAtPoint(b, faces, [40, 10, 10], [1, 0, 0])?.normal).toEqual([1, 0, 0]);
    expect(faceAtPoint(b, faces, [20, 15, 20], [0, 0, 1])?.area).toBeCloseTo(1200);
    expect(faceAtPoint(b, faces, [20, 15, 10], [1, 0, 0])).toBeNull(); // no meio do ar
  });

  test("girar para a face e voltar devolve a malha exatamente", () => {
    const b = block();
    const f = planarFaces(b).find((x) => x.normal[0] === 1)!;
    const there = toFaceFrame(b.parts[0].mesh, f);
    expect(meshBounds([there])!.max[2]).toBeCloseTo(0, 4); // a face fica em z = 0, olhando para cima
    const back = fromFaceFrame(there, f);
    back.positions.forEach((v, i) => expect(v).toBeCloseTo(b.parts[0].mesh.positions[i], 4));
  });

  test("decal embutido numa face lateral: a peça não muda de tamanho nem de lugar e a cor ocupa só o material tirado", async () => {
    const b = block();
    const side = planarFaces(b).find((x) => x.normal[0] === 1)!;
    const out = await applyOwnDecals(b, side, [layer()], M);
    const [body, fill] = out.models[0].parts;
    expect(out.warnings).toEqual([]);
    expect(fill.color).toBe("#d6262e");
    expect(volume(fill.mesh)).toBeCloseTo(10 * 10 * 0.6, 0);
    expect(volume(body.mesh) + volume(fill.mesh)).toBeCloseTo(40 * 30 * 20, 0);
    const bb = meshBounds([body.mesh, fill.mesh])!;
    expect([bb.min, bb.max]).toEqual([[expect.closeTo(0, 3), expect.closeTo(0, 3), expect.closeTo(0, 3)], [expect.closeTo(40, 3), expect.closeTo(30, 3), expect.closeTo(20, 3)]]);
    const fb = meshBounds([fill.mesh])!;
    expect(fb.max[0]).toBeCloseTo(40, 3); // rente à face
    expect(fb.min[0]).toBeCloseTo(39.4, 3);
    expect((fb.min[1] + fb.max[1]) / 2).toBeCloseTo(15, 2); // no centro da face
    expect((fb.min[2] + fb.max[2]) / 2).toBeCloseTo(10, 2);
    expect(out.face!.bounds.max[0] - out.face!.bounds.min[0]).toBeCloseTo(30, 2); // gizmo: a largura da face lateral (Y do bloco)
  });

  test("relevo numa face de baixo (de ponta-cabeça) sai para fora da peça", async () => {
    const b = block();
    const bottom = planarFaces(b).find((x) => x.normal[2] === -1)!;
    const out = await applyOwnDecals(b, bottom, [layer({ mode: "raised", depth: 1 })], M);
    const fb = meshBounds([out.models[0].parts[1].mesh])!;
    expect(fb.min[2]).toBeCloseTo(-1, 3);
    expect(fb.max[2]).toBeCloseTo(0, 3);
  });

  test("sem camadas devolve o modelo como veio", async () => {
    const b = block();
    const out = await applyOwnDecals(b, planarFaces(b)[0], [], M);
    expect(out.models[0]).toBe(b);
    expect(out.face).not.toBeNull();
  });

  test("face no fundo de uma reentrância é recusada com a explicação", async () => {
    const pocket = M.Manifold.cube([40, 30, 20], false).subtract(M.Manifold.cube([20, 10, 10], false).translate([10, 10, 10]));
    const model: Model = { name: "Bloco furado", parts: [{ name: "Peça", color: "#fff", mesh: toMesh(pocket) }] };
    const floor = planarFaces(model).find((f) => f.normal[2] === 1 && Math.abs(f.offset - 10) < 0.1)!;
    expect(floor.extreme).toBe(false);
    await expect(applyOwnDecals(model, floor, [layer()], M)).rejects.toThrow(OWN_MODEL_ERRORS.notExtreme);
  });

  test("STL em texto também é lido", () => {
    const txt = "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid t";
    const m = readAsciiStl(txt);
    expect(m.indices.length).toBe(3);
    expect(m.positions.length).toBe(9);
    expect(() => readAsciiStl("solid vazio\nendsolid")).toThrow(/vazio/);
  });

  test("3MF com dois objetos soltos: readOwnObjects devolve os dois (readOwnFile junta tudo num só)", async () => {
    const mk = (name: string, x: number): Model => ({ name, parts: [{ name, color: "#d4d4d8", mesh: toMesh(M.Manifold.cube([10, 10, 10], false).translate([x, 0, 0])) }] });
    const bytes = await write3mf([mk("A", 0), mk("B", 100)]);
    expect(readOwnObjects(bytes, "dois.3mf").map((m) => m.name)).toEqual(["A", "B"]);
    expect(readOwnFile(bytes, "dois.3mf").parts).toHaveLength(2);
  });
});

describe("decal em superfície curva de arquivo próprio (#212)", { timeout: 120_000 }, () => {
  const cup = (): Model => ({ name: "Copo", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(M.Manifold.cylinder(90, 40, 40, 128)) }] });
  const HEART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 90 C5 55 5 15 30 15 C42 15 50 25 50 30 C50 25 58 15 70 15 C95 15 95 55 50 90Z"/></svg>';

  test("logo na lateral de um copo: o relevo contorna o cilindro e o arquivo volta no lugar original", async () => {
    const spot = { part: 0, point: [40, 0, 45] as [number, number, number], normal: [1, 0, 0] as [number, number, number] };
    const out = await applyOwnCurved(cup(), spot, [layer({ svg: HEART, width: 30, mode: "raised", depth: 0.8, y: 0 })], M);
    const [body, relief] = out.models[0].parts;
    expect(out.warnings).toEqual([]);
    const bb = meshBounds([body.mesh])!;
    expect([bb.max[0], bb.max[2]]).toEqual([expect.closeTo(40, 2), expect.closeTo(90, 2)]); // a peça não mexe
    const rb = meshBounds([relief.mesh])!;
    expect(rb.max[0]).toBeCloseTo(40.8, 1); // 0,8 mm para fora, no ponto do clique
    expect((rb.min[2] + rb.max[2]) / 2).toBeCloseTo(45, 0); // centrado na altura do clique
    // acompanha o cilindro: todos os vértices do relevo ficam entre o raio 39,5 e 40,85
    for (let i = 0; i < relief.mesh.positions.length; i += 3) {
      const r = Math.hypot(relief.mesh.positions[i], relief.mesh.positions[i + 1]);
      expect(r).toBeGreaterThan(39.4);
      expect(r).toBeLessThan(40.9);
    }
  });

  test("gravado em arquivo próprio mantém a malha fechada (volume cai ≈ área × profundidade)", async () => {
    const v0 = volume(cup().parts[0].mesh);
    const spot = { part: 0, point: [0, 40, 45] as [number, number, number], normal: [0, 1, 0] as [number, number, number] };
    const out = await applyOwnCurved(cup(), spot, [layer({ svg: HEART, width: 24, mode: "engraved", depth: 0.5 })], M);
    const drop = v0 - volume(out.models[0].parts[0].mesh);
    expect(drop).toBeGreaterThan(24 * 22 * 0.5 * 0.3); // coração ≈ 50-60% do quadrado
    expect(drop).toBeLessThan(24 * 24 * 0.5);
  });

  test("num copo as faixas finas do cilindro não contam como faces planas: sobram o fundo e a borda", () => {
    const faces = wideFaces(cup(), planarFaces(cup()));
    expect(planarFaces(cup()).length).toBeGreaterThan(faces.length);
    expect(faces.every((f) => Math.abs(f.normal[2]) > 0.99)).toBe(true);
    expect(wideFaces(block(), planarFaces(block()))).toHaveLength(6);
  });

  test("dois tampos no mesmo plano viram duas faces com ids diferentes (a lista da tela usa o id como chave)", () => {
    const two = M.Manifold.cube([20, 20, 5], false).add(M.Manifold.cube([20, 20, 5], false).translate([40, 0, 0]));
    const m: Model = { name: "Dois", parts: [{ name: "Peça", color: "#ddd", mesh: toMesh(two) }] };
    const tops = planarFaces(m).filter((f) => f.normal[2] > 0.99);
    expect(tops).toHaveLength(2);
    expect(new Set(planarFaces(m).map((f) => f.id)).size).toBe(planarFaces(m).length);
  });

  test("a parte mais perto do clique é a escolhida", () => {
    const m: Model = { name: "Duas", parts: [cup().parts[0], { name: "Outra", color: "#fff", mesh: toMesh(M.Manifold.cube([5, 5, 5], true).translate([200, 0, 0])) }] };
    expect(partAtPoint(m, [199, 0, 0])).toBe(1);
    expect(partAtPoint(m, [40, 0, 40])).toBe(0);
  });
});
