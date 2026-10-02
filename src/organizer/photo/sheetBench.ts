import type { Scene } from "./testPhoto";

/** Cenas para medir a detecção da folha (#169): 4 posições do celular × 3 fundos. */
const POSES: Pick<Scene, "camera" | "target" | "roll">[] = [
  { camera: [160, 330, 420], target: [105, 150, 0], roll: 8 },
  { camera: [105, 150, 380], target: [105, 148, 0], roll: 0 },
  { camera: [250, 450, 330], target: [105, 150, 0], roll: -15 },
  { camera: [60, -40, 400], target: [105, 150, 0], roll: 25 },
];
const BACKGROUNDS: [string, Scene["table"]][] = [
  ["mesa escura", undefined],
  ["mesa clara, sombra leve", { tone: 228, shadow: { width: 1.5, strength: 0.85 } }],
  ["mesa clara, sombra fraca", { tone: 232, shadow: { width: 1, strength: 0.92 } }],
];

export const BENCH: { name: string; scene: Scene }[] = BACKGROUNDS.flatMap(([bg, table]) =>
  POSES.map((p, i) => ({
    name: `${bg}, pose ${i + 1}`,
    scene: { sheet: { w: 210, h: 297 }, boxes: [{ x: 55, y: 120, w: 100, d: 40, h: 0 }], focalPx: 1300, size: [1600, 1200], ...p, table },
  })),
);
