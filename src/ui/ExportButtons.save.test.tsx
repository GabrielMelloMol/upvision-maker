// @vitest-environment happy-dom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Model } from "../geometry/types";
import { renderWithApp, setupTauri } from "../test/harness";
import ExportButtons from "./ExportButtons";

vi.mock("../geometry/threemf", async (orig) => ({
  ...(await orig<typeof import("../geometry/threemf")>()),
  write3mf: () => {
    throw new Error("malha inválida");
  },
}));
vi.mock("../geometry/stl", () => ({
  writeStl: () => {
    throw new Error("stl quebrado");
  },
}));

setupTauri();
const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
const models: Model[] = [{ name: "A", parts: [{ name: "A", color: "#000000", mesh }] }];

test("erro ao montar o 3MF (antes do diálogo) vira toast de erro, não silêncio", async () => {
  const user = userEvent.setup();
  renderWithApp(<ExportButtons models={models} name="x" />);
  await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
  expect(await screen.findByText(/Não foi possível salvar: .*malha inválida/)).toBeInTheDocument();
});

test("erro ao montar o STL vira toast de erro", async () => {
  const user = userEvent.setup();
  renderWithApp(<ExportButtons models={models} name="x" />);
  await user.click(screen.getByRole("button", { name: /Salvar STL/ }));
  expect(await screen.findByText(/Não foi possível salvar: .*stl quebrado/)).toBeInTheDocument();
});
