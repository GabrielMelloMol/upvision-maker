import { unzipSync, strFromU8 } from "fflate";
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import { csFromContours, fitWidth, outerOnly, scoped } from "./shape2d";
import { writeStl } from "./stl";
import { write3mf } from "./threemf";
import type { Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const square = (x: number, y: number, s: number): [number, number][] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

describe("shape2d", () => {
  test("outerOnly preenche os furos (miolo do 'O')", () =>
    scoped((k) => {
      const ring = k(csFromContours(M, [square(0, 0, 10), square(3, 3, 4)], "EvenOdd"));
      expect(ring.area()).toBeCloseTo(84);
      expect(k(outerOnly(M, ring)).area()).toBeCloseTo(100);
    }));

  test("fitWidth escala para a largura em mm, inverte Y do SVG e centraliza na origem", () =>
    scoped((k) => {
      // retângulo 200×100 px no topo da imagem (y pequeno) → 80×40 mm
      const cs = k(fitWidth(k(csFromContours(M, [[[0, 0], [200, 0], [200, 100], [0, 100]]], "NonZero")), 80));
      const b = cs.bounds();
      expect(b.max[0] - b.min[0]).toBeCloseTo(80);
      expect(b.max[1] - b.min[1]).toBeCloseTo(40);
      expect(b.min[0]).toBeCloseTo(-40);
      expect(b.min[1]).toBeCloseTo(-20);
    }));

  test("fitWidth inverte Y: ponto do topo do SVG vai para cima", () =>
    scoped((k) => {
      // triângulo com a ponta em y=0 (topo no SVG)
      const cs = k(fitWidth(k(csFromContours(M, [[[50, 0], [100, 100], [0, 100]]], "NonZero")), 100));
      const top = cs.toPolygons()[0].reduce((a, p) => (p[1] > a[1] ? p : a));
      expect(top[0]).toBeCloseTo(0);
    }));
});

function cubeModel(): Model {
  return scoped((k) => ({
    name: "Cubo",
    parts: [
      { name: "Base", color: "#2563eb", mesh: toMesh(k(M.Manifold.cube([10, 10, 2]))) },
      { name: "Topo", color: "#f97316", mesh: toMesh(k(M.Manifold.cube([4, 4, 1]).translate([3, 3, 2]))) },
    ],
  }));
}

test("toMesh devolve malha fechada (12 triângulos num cubo)", () => {
  const m = cubeModel().parts[0].mesh;
  expect(m.indices.length / 3).toBe(12);
  expect(m.positions.length / 3).toBe(8);
});

test("STL binário: cabeçalho de 80 bytes, contagem e 50 bytes por triângulo", () => {
  const buf = writeStl([cubeModel()]);
  const view = new DataView(buf.buffer);
  expect(view.getUint32(80, true)).toBe(24);
  expect(buf.byteLength).toBe(84 + 24 * 50);
});

describe("3MF", () => {
  let files: Record<string, Uint8Array>;
  let model: string;
  let config: string;
  beforeAll(() => {
    files = unzipSync(write3mf([cubeModel(), { ...cubeModel(), name: "Cubo 2" }]));
    model = strFromU8(files["3D/3dmodel.model"]);
    config = strFromU8(files["Metadata/model_settings.config"]);
  });

  test("tem os arquivos obrigatórios do pacote", () => {
    expect(Object.keys(files).sort()).toEqual(["3D/3dmodel.model", "Metadata/model_settings.config", "[Content_Types].xml", "_rels/.rels"]);
  });

  test("cada objeto vira um item de build com uma parte (componente) por cor", () => {
    expect(model.match(/<item /g)).toHaveLength(2);
    expect(model.match(/<component /g)).toHaveLength(4);
    expect(model.match(/<triangle /g)).toHaveLength(48);
    expect(model).toContain('unit="millimeter"');
  });

  test("model_settings atribui extrusora por cor (Bambu Studio / OrcaSlicer)", () => {
    expect(config.match(/<part /g)).toHaveLength(4);
    expect(config).toContain('<metadata key="name" value="Topo"/>');
    expect(config.match(/key="extruder" value="2"/g)).toHaveLength(2);
  });

  test("pausas viram custom_gcode_per_layer (pausa antes da camada com topo em Z)", () => {
    const f = unzipSync(write3mf([cubeModel()], { pauses: [2, 4.4] }));
    const xml = strFromU8(f["Metadata/custom_gcode_per_layer.xml"]);
    expect(xml).toContain('<layer top_z="2" type="1" extruder="1" color="" extra="" gcode="M400 U1"/>');
    expect(xml).toContain('<layer top_z="4.4" type="1"');
    expect(strFromU8(f["[Content_Types].xml"])).toContain('Extension="xml"');
  });

  test("sem pausas não há custom_gcode_per_layer", () => {
    expect(files["Metadata/custom_gcode_per_layer.xml"]).toBeUndefined();
  });

  test("escapa XML em nomes digitados pelo usuário", () => {
    const m = cubeModel();
    const f = unzipSync(write3mf([{ ...m, name: 'Ana & "Bia" <3' }]));
    expect(strFromU8(f["Metadata/model_settings.config"])).toContain("Ana &amp; &quot;Bia&quot; &lt;3");
  });
});
