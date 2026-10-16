import { beforeAll, describe, expect, test } from "vitest";
import { fitAsync } from "./cutClient";
import { regionBox } from "./cutRegion";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { toMesh } from "./mesh";
import type { Model } from "./types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// dois blocos de 20 × 20 × 40 lado a lado (x 0–20 e x 40–60), numa peça só
const scene = (): Model => ({ name: "Cena", parts: [{ name: "Peça", color: "#d4d4d8", mesh: toMesh(M.Manifold.union([M.Manifold.cube([20, 20, 40]), M.Manifold.cube([20, 20, 40]).translate([40, 0, 0])])) }] });

describe("fitAsync (sem Worker: mesma thread)", () => {
  test("a região 'na parte clicada' envolve só o bloco mais perto do ponto, acima do plano", async () => {
    const region = await fitAsync(scene(), { axis: "z", tilt: 0, offset: 20, region: null }, "box", [50, 10, 30]).promise;
    const box = regionBox(region);
    expect(box.min[0]).toBeGreaterThan(30);
    expect(box.max[0]).toBeGreaterThan(59);
    expect(box.min[2]).toBeGreaterThanOrEqual(19);
  });

  test("plano fora da peça rejeita com a mensagem do motor", async () => {
    await expect(fitAsync(scene(), { axis: "z", tilt: 0, offset: 500, region: null }, "box", [0, 0, 0]).promise).rejects.toThrow(/plano de corte/);
  });
});
