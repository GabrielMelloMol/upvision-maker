import { expect, test } from "vitest";
import { duplicateLayer, EDGE_MARGIN_MM, moveLayer, newArtLayer, newTextLayer, normalizeRotation, removeLayer, rotatedHalf, snapPosition, updateLayer } from "./layers";

const face = { min: [-50, -20] as [number, number], max: [50, 20] as [number, number] };

test("camada nova fica no centro da face, com 40 % da largura (máx. 40 mm), em relevo (#26)", () => {
  const a = newArtLayer("<svg/>", "logo.svg", face);
  expect(a).toMatchObject({ kind: "art", name: "logo.svg", x: 0, y: 0, width: 40, rotation: 0, mode: "raised", visible: true });
  const t = newTextLayer({ min: [0, 0], max: [50, 10] });
  expect(t).toMatchObject({ kind: "text", text: "Texto", x: 25, y: 5, width: 20 });
  expect(a.id).not.toBe(t.id);
});

test("duplicar, mover na ordem, atualizar e excluir", () => {
  const a = newArtLayer("<svg/>", "a", face), b = newTextLayer(face);
  const dup = duplicateLayer([a, b], a.id);
  expect(dup.list.map((l) => l.name)).toEqual(["a", "a (cópia)", "Texto"]);
  expect(dup.list[1]).toMatchObject({ x: 5, y: -5 });
  expect(moveLayer([a, b], a.id, 1).map((l) => l.id)).toEqual([b.id, a.id]);
  expect(moveLayer([a, b], a.id, -1)).toEqual([a, b]); // já é a primeira
  expect(updateLayer([a, b], b.id, { text: "Oi" })[1].text).toBe("Oi");
  expect(removeLayer([a, b], a.id)).toEqual([b]);
});

test("snap: centro gruda no centro; borda gruda na borda com folga; longe não mexe", () => {
  expect(snapPosition(0.8, -1, [10, 5], face)).toEqual({ x: 0, y: 0, guides: { x: [0], y: [0] } });
  const left = -50 + EDGE_MARGIN_MM + 10;
  expect(snapPosition(left + 1, 7, [10, 5], face)).toMatchObject({ x: left, y: 7, guides: { x: [-50 + EDGE_MARGIN_MM], y: [] } });
  expect(snapPosition(20, 8, [10, 5], face).guides).toEqual({ x: [], y: [] });
});

test("caixa girada e giro normalizado", () => {
  const [hw, hh] = rotatedHalf(20, 10, 90);
  expect(hw).toBeCloseTo(5);
  expect(hh).toBeCloseTo(10);
  expect(normalizeRotation(190)).toBe(-170);
  expect(normalizeRotation(37, true)).toBe(30);
});
