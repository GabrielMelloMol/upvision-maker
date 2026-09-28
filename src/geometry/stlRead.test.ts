import { expect, test } from "vitest";
import { readBinaryStl } from "./stlRead";
import { writeStl } from "./stl";

test("lê STL binário e junta vértices repetidos (malha indexada)", () => {
  // tetraedro: 4 vértices, 4 triângulos
  const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]);
  const indices = new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]);
  const bin = writeStl([{ name: "t", parts: [{ name: "t", color: "#000", mesh: { positions, indices } }] }]);
  const m = readBinaryStl(bin);
  expect(m.indices.length).toBe(12);
  expect(m.positions.length).toBe(12); // 4 vértices únicos
});

test("arquivo truncado (diz ter 5 triângulos mas não tem) dá erro", () => {
  const bad = new Uint8Array(90);
  new DataView(bad.buffer).setUint32(80, 5, true);
  expect(() => readBinaryStl(bad)).toThrow(/truncado/);
});
