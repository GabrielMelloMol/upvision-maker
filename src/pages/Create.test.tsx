// @vitest-environment happy-dom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { takeIntent } from "../tools/intent";
import { MODELS } from "../tools/models/defs";
import { renderWithApp } from "../test/harness";
import Create from "./Create";

const tools = () => within(screen.getByRole("region", { name: "Ferramentas" })).getAllByRole("link");

test("Criar (#139): busca sem acento, filtro por tipo e modelo pronto abre já escolhido", async () => {
  const go = vi.fn();
  const user = userEvent.setup();
  renderWithApp(<Create go={go} />);
  expect(tools().length).toBeGreaterThan(10);
  expect(screen.getAllByRole("link", { name: MODELS[0].label }).length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "De um desenho ou foto" }));
  expect(tools().map((a) => a.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/^Cortador de biscoito/)]));
  expect(screen.queryByRole("link", { name: MODELS[0].label })).not.toBeInTheDocument(); // modelos só em Tudo e Personalizar

  await user.click(screen.getByRole("button", { name: "Tudo" }));
  await user.type(screen.getByRole("searchbox", { name: "Buscar ferramenta ou modelo" }), "medalha");
  expect(tools().map((a) => a.textContent)).toEqual([expect.stringMatching(/^Medalhas/)]);

  await user.clear(screen.getByRole("searchbox"));
  await user.type(screen.getByRole("searchbox"), "zzzz");
  expect(screen.getByText(/Nada com “zzzz”/)).toBeInTheDocument();

  await user.clear(screen.getByRole("searchbox"));
  await user.click(screen.getAllByRole("link", { name: MODELS[3].label })[0]);
  expect(go).toHaveBeenLastCalledWith("models");
  expect(takeIntent("models")).toEqual({ id: MODELS[3].id });
  await user.click(tools()[0]);
  expect(go).toHaveBeenLastCalledWith("svg");
});
