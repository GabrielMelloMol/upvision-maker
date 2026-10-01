import * as THREE from "three";
import { expect, test } from "vitest";
import { fitCamera, projectedBox, THUMB_VIEW } from "./frame";

const box = (sx: number, sy: number, sz: number, at = [0, 0, 0]) => new THREE.Box3(new THREE.Vector3(at[0], at[1], at[2]), new THREE.Vector3(at[0] + sx, at[1] + sy, at[2] + sz));

test("enquadramento: peça de qualquer tamanho e lugar ocupa a tela com a mesma margem e centrada (#149)", () => {
  for (const b of [box(40, 30, 5), box(300, 20, 10, [100, -50, 0]), box(30, 30, 200), box(2, 2, 2)]) {
    const cam = new THREE.PerspectiveCamera(THUMB_VIEW.fov, 4 / 3, 0.1, 1e5);
    fitCamera(cam, b, THUMB_VIEW.dir, THUMB_VIEW.margin);
    const r = projectedBox(cam, b);
    // centrada
    expect((r.minX + r.maxX) / 2).toBeCloseTo(0, 2);
    expect((r.minY + r.maxY) / 2).toBeCloseTo(0, 2);
    // o lado que aperta encosta na margem; nada passa dela
    const halfW = (r.maxX - r.minX) / 2, halfH = (r.maxY - r.minY) / 2;
    expect(Math.max(halfW, halfH)).toBeCloseTo(1 - THUMB_VIEW.margin, 2);
    expect(halfW).toBeLessThanOrEqual(1 - THUMB_VIEW.margin + 1e-3);
    expect(halfH).toBeLessThanOrEqual(1 - THUMB_VIEW.margin + 1e-3);
  }
});
