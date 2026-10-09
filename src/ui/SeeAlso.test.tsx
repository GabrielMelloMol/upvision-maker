// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { takeIntent } from "../tools/intent";
import { NAVIGATE_EVENT } from "./navigate";
import SeeAlso from "./SeeAlso";

test("'Veja também' abre a outra ferramenta ou o modelo pronto, com o modelo já escolhido", async () => {
  const seen = vi.fn();
  window.addEventListener(NAVIGATE_EVENT, (e) => seen((e as CustomEvent<string>).detail));
  const user = userEvent.setup();
  render(<SeeAlso items={[{ label: "Organizador pela foto", page: "toolfit" }, { label: "Gridfinity pela gaveta", model: "gridDrawerBase" }]} />);
  expect(screen.getByText(/Veja também:/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Organizador pela foto" }));
  expect(seen).toHaveBeenLastCalledWith("toolfit");
  await user.click(screen.getByRole("button", { name: "Gridfinity pela gaveta" }));
  expect(seen).toHaveBeenLastCalledWith("models");
  expect(takeIntent("models")).toEqual({ id: "gridDrawerBase" });
});
