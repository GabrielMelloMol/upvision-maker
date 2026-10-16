import { writeFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { SPORT_IDS, SPORT_LABELS, sportSilhouette } from "./sports";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

describe("silhuetas de esportes (#223)", () => {
  test.each(SPORT_IDS)("%s: uma peça só, na altura pedida, com os pés no chão e área razoável", (id) => {
    const cs = sportSilhouette(M, id, 100);
    const b = cs.bounds();
    expect(cs.decompose()).toHaveLength(1);
    expect(Math.max(b.max[1], b.max[0] - b.min[0])).toBeCloseTo(100, 3); // a maior dimensão é o tamanho pedido
    expect(b.min[1]).toBeLessThan(0); // o chão
    expect(b.min[1]).toBeGreaterThan(-5);
    expect(cs.area()).toBeGreaterThan(900);
    cs.delete();
  });

  test.each(SPORT_IDS)("%s: nenhum traço mais fino que 1,6 mm no tamanho de 110 mm (imprime com bico de 0,4)", (id) => {
    const cs = sportSilhouette(M, id, 110);
    const opened = cs.offset(-0.8, "Miter").offset(0.8, "Miter"); // o que sobra depois de tirar tudo mais fino que 1,6 mm
    expect(opened.area() / cs.area()).toBeGreaterThan(0.985);
    opened.delete();
    cs.delete();
  });

  test("todo esporte tem nome e são 15", () => {
    expect(SPORT_IDS).toHaveLength(15);
    for (const id of SPORT_IDS) expect(SPORT_LABELS[id].length).toBeGreaterThan(2);
  });

  test.skipIf(!process.env.SPORTS_SHEET)("folha de contato (SVG) para conferir os desenhos", () => {
    const cell = 150;
    const cols = 5;
    const paths = SPORT_IDS.map((id, i) => {
      const cs = sportSilhouette(M, id, 110);
      const d = cs.toPolygons().map((poly) => "M" + poly.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join("L") + "Z").join("");
      cs.delete();
      const cx = (i % cols) * cell + cell / 2;
      const cy = Math.floor(i / cols) * cell + 125;
      return `<g transform="translate(${cx},${cy})"><path d="${d}" fill="#111" fill-rule="evenodd"/><text y="22" x="-30" font-size="10" font-family="sans-serif">${SPORT_LABELS[id]}</text></g>`;
    });
    writeFileSync(process.env.SPORTS_SHEET!, `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${Math.ceil(SPORT_IDS.length / cols) * cell}"><rect width="100%" height="100%" fill="#fff"/>${paths.join("")}</svg>`);
  });
});
