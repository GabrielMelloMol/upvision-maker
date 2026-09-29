import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { meshBounds } from "./bounds";
import { decodePaint, type Tri } from "./paint";
import { read3mf } from "./threemfRead";
import { write3mf } from "./threemf";

const fixture = (n: string) => new Uint8Array(readFileSync(resolve(__dirname, "../../tests/fixtures/3mf", n)));

describe("ler 3MF", () => {
  test("projeto do Bambu Studio (gerado pelo CLI): objeto em 3D/Objects, pintura, extrusora e cores dos filamentos", () => {
    const r = read3mf(fixture("cubo-pintado-bambu.3mf"));
    expect(r.objects).toHaveLength(1);
    const [part] = r.objects[0].parts;
    expect(part.name).toBe("Cubo");
    expect(part.extruder).toBe(1);
    expect(part.mesh.indices.length).toBe(36);
    const b = meshBounds([part.mesh])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(20);
    expect(b.min[2]).toBeCloseTo(0); // posição na mesa preservada (transformações aplicadas)
    expect(part.paint!.filter(Boolean)).toEqual(["8", "8", "000C03"]);
    expect(r.filamentColors).toEqual(["#00ae42"]); // o Bambu só grava os filamentos dos volumes, não os da pintura
  });

  test("pintura decodificada: topo no filamento 2; na frente, só o filho de cima no 3", () => {
    const { mesh, paint } = read3mf(fixture("cubo-pintado-bambu.3mf")).objects[0].parts[0];
    const tri = (i: number): Tri => [0, 1, 2].map((k) => {
      const v = mesh.indices[i * 3 + k] * 3;
      return [mesh.positions[v], mesh.positions[v + 1], mesh.positions[v + 2]];
    }) as Tri;
    expect(decodePaint(paint![2], tri(2))).toEqual([{ tri: tri(2), state: 2 }]);
    const front = decodePaint(paint![4], tri(4));
    expect(front.map((l) => l.state)).toEqual([0, 0, 3, 0]);
    const top = front[2].tri;
    expect(Math.min(...top.map((p) => p[2]))).toBeGreaterThan(0); // não toca a mesa
  });

  test("peça com 2 partes (chaveiro exportado pelo Bambu): uma parte por extrusora", () => {
    const r = read3mf(fixture("chaveiro-2-partes-bambu.3mf"));
    expect(r.objects[0].parts.map((p) => p.extruder)).toEqual([1, 2]);
    expect(r.objects[0].parts.every((p) => p.paint === null)).toBe(true);
  });

  test("3MF simples com pintura inline (e o nosso próprio 3MF) também são lidos", () => {
    expect(read3mf(fixture("cubo-pintado-simples.3mf")).objects[0].parts[0].paint!.filter(Boolean)).toHaveLength(3);
    const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) };
    const ours = read3mf(write3mf([{ name: "M", parts: [{ name: "A", color: "#000000", mesh }, { name: "B", color: "#ffffff", mesh }] }]));
    expect(ours.objects[0].parts.map((p) => [p.name, p.extruder])).toEqual([
      ["A", 1],
      ["B", 2],
    ]);
  });

  test("arquivo que não é 3MF: erro claro", () => {
    expect(() => read3mf(new Uint8Array([1, 2, 3]))).toThrow(/3MF válido/);
  });
});
