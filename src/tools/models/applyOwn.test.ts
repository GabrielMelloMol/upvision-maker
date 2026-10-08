// @vitest-environment happy-dom
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../../geometry/bounds";
import { getManifold, type ManifoldToplevel } from "../../geometry/manifold";
import { toMesh } from "../../geometry/mesh";
import { faceAtPoint, fromFaceFrame, planarFaces, readAsciiStl, toFaceFrame } from "../../geometry/ownModel";
import { volume } from "../../geometry/testUtil";
import type { Model } from "../../geometry/types";
import { applyOwnDecals, OWN_MODEL_ERRORS } from "./applyOwn";
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
});
