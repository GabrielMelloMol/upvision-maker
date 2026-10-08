import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "./manifold";
import { composeKeychainArt, LOGO_GAP_MM, NO_MOVE, offsetFromCenter } from "./keychainArt";
import { csFromContours, scoped } from "./shape2d";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

// texto de teste: bloco 20 × 10 centrado; logo: barra 12 × 4 (comprida para ver o giro)
const rect = (w: number, h: number): [number, number][] => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
const text = () => csFromContours(M, [rect(20, 10)], "NonZero");
const bar = () => csFromContours(M, [rect(12, 4)], "NonZero");
const bounds = (cs: { bounds(): { min: number[]; max: number[] } }) => cs.bounds();

describe("posição da arte no chaveiro (#183)", () => {
  test("sem ajuste: à esquerda do texto com o espaço de sempre, centrada na altura", () => {
    scoped((k) => {
      const t = k(text()), l = k(bar());
      const r = composeKeychainArt(k, { text: t, logo: l, layers: null, move: NO_MOVE, silhouette: false });
      const b = bounds(r.logo!);
      expect(b.max[0]).toBeCloseTo(bounds(t).min[0] - LOGO_GAP_MM);
      expect((b.min[1] + b.max[1]) / 2).toBeCloseTo(0);
      expect(r.center[0]).toBeCloseTo(bounds(t).min[0] - LOGO_GAP_MM - 6); // metade da largura (12)
      expect(bounds(r.art).min[0]).toBeCloseTo(b.min[0]); // a arte inteira = texto + logo
    });
  });

  test("girar 90° troca largura e altura do logo em torno do centro dele", () => {
    scoped((k) => {
      const t = k(text()), l = k(bar());
      const flat = composeKeychainArt(k, { text: t, logo: l, layers: null, move: NO_MOVE, silhouette: false });
      const up = composeKeychainArt(k, { text: t, logo: l, layers: null, move: { rot: 90, dx: 0, dy: 0 }, silhouette: false });
      const [a, b] = [bounds(flat.logo!), bounds(up.logo!)];
      expect(b.max[0] - b.min[0]).toBeCloseTo(a.max[1] - a.min[1]);
      expect(b.max[1] - b.min[1]).toBeCloseTo(a.max[0] - a.min[0]);
      expect(up.center).toEqual(flat.center); // gira no lugar: o centro não anda
    });
  });

  test("mover desloca exatamente em mm; as camadas de cor do logo vão junto", () => {
    scoped((k) => {
      const t = k(text()), l = k(bar());
      const layers = [{ color: "#f00", cs: k(bar()) }];
      const base = composeKeychainArt(k, { text: t, logo: l, layers, move: NO_MOVE, silhouette: false });
      const moved = composeKeychainArt(k, { text: t, logo: l, layers, move: { rot: 30, dx: 5, dy: -3 }, silhouette: false });
      expect(moved.center[0]).toBeCloseTo(base.center[0] + 5);
      expect(moved.center[1]).toBeCloseTo(base.center[1] - 3);
      const [lb, cb] = [bounds(moved.logo!), bounds(moved.layers![0].cs)];
      expect(cb.min[0]).toBeCloseTo(lb.min[0]);
      expect(cb.max[1]).toBeCloseTo(lb.max[1]);
      expect(moved.layers![0].color).toBe("#f00");
    });
  });

  test("sem texto e na silhueta o centro padrão é a origem; só o logo vira a arte quando não há texto", () => {
    scoped((k) => {
      const l = k(bar());
      const alone = composeKeychainArt(k, { text: null, logo: l, layers: null, move: { rot: 0, dx: 4, dy: 2 }, silhouette: false });
      expect(alone.center).toEqual([4, 2]);
      expect(bounds(alone.art).min[0]).toBeCloseTo(-2); // 4 − 12/2
      const t = k(text());
      const sil = composeKeychainArt(k, { text: t, logo: l, layers: null, move: NO_MOVE, silhouette: true });
      expect(sil.center).toEqual([0, 0]);
      expect(bounds(sil.art).max[0]).toBeCloseTo(bounds(t).max[0]); // na silhueta a arte é só o texto
    });
  });

  test("offsetFromCenter é o inverso: a posição que a alça solta vira o deslocamento certo", () => {
    expect(offsetFromCenter([-23, 0], [-25, 0])).toEqual({ dx: 2, dy: 0 });
    expect(offsetFromCenter([-20, 4.04], [-25, 0])).toEqual({ dx: 5, dy: 4 }); // arredonda a 0,1 mm
  });
});
