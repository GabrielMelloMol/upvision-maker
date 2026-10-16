import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LAYER_MM, LAYER_ROWS, layerUVs, splitTops, TOP_LINE_MM } from "./materials";

/** Caixa 10×10×4 sem índice, com normais por face. */
const box = () => {
  const g = new THREE.BoxGeometry(10, 10, 4).toNonIndexed();
  return g;
};

describe("foto realista: camadas", () => {
  it("separa as faces de cima e de baixo das paredes", () => {
    const { walls, tops } = splitTops(box());
    expect(tops!.getAttribute("position").count / 3).toBe(4); // 2 triângulos em cima + 2 embaixo
    expect(walls!.getAttribute("position").count / 3).toBe(8);
  });

  it("v da parede percorre a textura (várias camadas) uma vez a cada LAYER_ROWS camadas", () => {
    const { walls } = splitTops(box());
    layerUVs(walls!);
    const pos = walls!.getAttribute("position"), uv = walls!.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) expect(uv.getY(i)).toBeCloseTo(pos.getZ(i) / (LAYER_MM * LAYER_ROWS), 4);
  });

  it("v da face de cima percorre a textura uma vez a cada LAYER_ROWS traços do bico, a 45°", () => {
    const { tops } = splitTops(box());
    layerUVs(tops!);
    const pos = tops!.getAttribute("position"), uv = tops!.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) expect(uv.getY(i)).toBeCloseTo((pos.getX(i) + pos.getY(i)) * Math.SQRT1_2 / (TOP_LINE_MM * LAYER_ROWS), 4);
  });
});
