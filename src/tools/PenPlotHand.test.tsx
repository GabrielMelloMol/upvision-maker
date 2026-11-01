// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { toolState } from "../db/toolStateRepo";
import { renderWithApp, setupTauri } from "../test/harness";
import PenPlot from "./PenPlot";

const t = setupTauri();

// o quadro mede 100 × 100 px na tela de teste: 1 px = 1 unidade
beforeEach(() => {
  SVGElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
});

function draw(pad: Element, pts: [number, number][]) {
  fireEvent.pointerDown(pad, { clientX: pts[0][0], clientY: pts[0][1], pointerId: 1 });
  for (const [x, y] of pts.slice(1)) fireEvent.pointerMove(pad, { clientX: x, clientY: y, pointerId: 1 });
  fireEvent.pointerUp(pad, { pointerId: 1 });
}

test("à mão livre: o rabisco vira traço na mesa e dá para desfazer (#314)", async () => {
  const user = userEvent.setup();
  const { container } = renderWithApp(<PenPlot />);
  await user.click(screen.getByRole("button", { name: "À mão livre" }));
  draw(screen.getByRole("img", { name: /mão livre/ }), [[10, 10], [50, 50], [90, 20]]);
  await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline")).toHaveLength(1));
  await user.click(screen.getByRole("button", { name: "Adicionar à mesa" })); // #322
  await waitFor(() => expect(screen.getByRole("button", { name: /Salvar G-code/ })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Desfazer traço" }));
  await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline")).toHaveLength(0));
});

test("minha letra: desenha o A, guarda no banco e o texto usa ela; o resto sai na cursiva (#314)", async () => {
  const user = userEvent.setup();
  const { container } = renderWithApp(<PenPlot />);
  await user.click(screen.getByRole("button", { name: "Texto" }));
  await user.click(screen.getByRole("button", { name: "Minha letra" }));
  await user.click(screen.getByRole("button", { name: "Desenhar a minha letra" }));
  draw(screen.getByRole("img", { name: "Quadro da letra A" }), [[20, 70], [50, 20], [80, 70]]);
  draw(screen.getByRole("img", { name: "Quadro da letra A" }), [[30, 50], [70, 50]]);
  await user.click(screen.getByRole("button", { name: "Guardar e ir para a próxima" }));
  await waitFor(async () => expect(await toolState.get(t.db, "plotter:alfabeto")).not.toBeNull());
  const saved = JSON.parse((await toolState.get(t.db, "plotter:alfabeto"))!.data);
  expect(saved.A[0]).toHaveLength(2);
  expect(screen.getByRole("img", { name: "Quadro da letra B" })).toBeInTheDocument();
  expect(await toolState.recent(t.db)).not.toContainEqual(expect.objectContaining({ id: "plotter:alfabeto" }));
  await user.click(screen.getByRole("button", { name: "Pronto" }));
  const box = screen.getByLabelText("Texto");
  await user.clear(box);
  await user.type(box, "AA");
  await waitFor(() => expect(container.querySelectorAll(".plot-preview polyline")).toHaveLength(4));
  expect(screen.getByText(/1 letras desenhadas/)).toBeInTheDocument();
});
