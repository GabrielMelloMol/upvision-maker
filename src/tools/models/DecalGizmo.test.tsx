// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { FaceInfo } from "./applyLayers";
import DecalGizmo from "./DecalGizmo";
import { newTextLayer } from "./layers";

const face: FaceInfo = { part: "Placa", outline: [[[0, 0], [50, 0], [50, 30], [0, 30]]], others: [], bounds: { min: [0, 0], max: [50, 30] } };

test("setas movem a camada e o leitor de tela ouve a nova posição; o rótulo diz onde escolher a camada (#144)", () => {
  const layer = { ...newTextLayer(face.bounds), text: "Ana" };
  const onCommit = vi.fn();
  const view = render(<DecalGizmo face={face} layers={[layer]} shapes={{ [layer.id]: { polys: [], width: 10, height: 5 } }} selected={layer.id} onSelect={() => {}} onCommit={onCommit} />);
  const gizmo = screen.getByRole("group", { name: /Vista de cima de Placa/ });
  expect(gizmo).toHaveAccessibleName(expect.stringMatching(/lista Camadas/));
  fireEvent.keyDown(gizmo, { key: "ArrowRight" });
  expect(onCommit).toHaveBeenCalledWith(layer.id, { x: layer.x + 1, y: layer.y });
  const live = view.container.querySelector("[aria-live='polite']")!;
  expect(live).toHaveClass("sr-only");
  expect(live).toHaveTextContent(`Ana: x ${layer.x + 1} mm, y ${layer.y} mm, ${layer.width} mm de largura`);
  fireEvent.keyDown(gizmo, { key: "ArrowUp", shiftKey: true });
  expect(live).toHaveTextContent(`y ${layer.y + 5} mm`);
});
