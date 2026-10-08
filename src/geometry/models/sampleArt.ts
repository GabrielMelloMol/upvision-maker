import type { CS, ManifoldToplevel } from "../manifold";

const ART_MM = 100; // como o Models.tsx: o desenho chega com 100 mm e cada modelo reescala

/** Desenho de teste: coração (2 círculos + quadrado a 45°), 100 mm de largura, centrado. */
export function testArt(M: ManifoldToplevel): CS {
  const r = 25;
  const lobe = (x: number) => M.CrossSection.circle(r, 64).translate([x, r * 0.6]);
  const tip = M.CrossSection.square([2 * r * 1.2, 2 * r * 1.2], true).rotate(45).translate([0, -r * 0.3]);
  const heart = M.CrossSection.union([lobe(-r * 0.75), lobe(r * 0.75), tip]);
  const b = heart.bounds();
  const s = ART_MM / (b.max[0] - b.min[0]);
  return heart.scale([s, s]).translate([-((b.min[0] + b.max[0]) / 2) * s, -((b.min[1] + b.max[1]) / 2) * s]);
}

const SAMPLE_COLORS = ["#1f2a44", "#c0392b", "#f0a30a", "#f5efe0"]; // do fundo para a frente
const SAMPLE_STEP_MM = 7;

/** Desenho de teste colorido: o coração em 4 anéis encaixados, cada um de uma cor (sem sobreposição), no mesmo sistema de `testArt`. */
export function testArtLayers(M: ManifoldToplevel): { color: string; cs: CS }[] {
  const layers: { color: string; cs: CS }[] = [];
  let rest = testArt(M);
  for (const color of SAMPLE_COLORS.slice(0, -1)) {
    const inner = rest.offset(-SAMPLE_STEP_MM, "Round", 2, 48);
    layers.push({ color, cs: rest.subtract(inner) });
    rest = inner;
  }
  layers.push({ color: SAMPLE_COLORS[SAMPLE_COLORS.length - 1], cs: rest });
  return layers;
}
