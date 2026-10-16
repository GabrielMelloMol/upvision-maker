// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import StripEditor from "./StripEditor";

const custom = { layoutMode: "custom" };

describe("StripEditor", () => {
  test("só aparece no modo faixa por faixa", () => {
    const { container } = render(<StripEditor label="Faixas" value="6:1" onChange={() => {}} params={{ layoutMode: "equal" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("lista as faixas da frente para o fundo e grava com + e −", async () => {
    const onChange = vi.fn();
    render(<StripEditor label="Faixas" value="6:1, 3:1.5" onChange={onChange} params={custom} />);
    expect(screen.getByText("Faixa 1")).toBeInTheDocument();
    expect(screen.getByText("Faixa 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mais nichos na faixa 2" }));
    expect(onChange).toHaveBeenLastCalledWith("6:1, 4:1.5");
    await userEvent.click(screen.getByRole("button", { name: "Menos nichos na faixa 1" }));
    expect(onChange).toHaveBeenLastCalledWith("5:1, 3:1.5");
    await userEvent.click(screen.getByRole("button", { name: "Faixa 1 mais funda" }));
    expect(onChange).toHaveBeenLastCalledWith("6:1.25, 3:1.5");
    await userEvent.click(screen.getByRole("button", { name: "Faixa 2 mais rasa" }));
    expect(onChange).toHaveBeenLastCalledWith("6:1, 3:1.25");
  });

  test("limites: 1 a 10 nichos e proporção de 0,5 a 4", () => {
    render(<StripEditor label="Faixas" value="1:0.5, 10:4" onChange={() => {}} params={custom} />);
    expect(screen.getByRole("button", { name: "Menos nichos na faixa 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Faixa 1 mais rasa" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mais nichos na faixa 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Faixa 2 mais funda" })).toBeDisabled();
  });

  test("remover (mínimo 1 faixa) e + faixa (máximo 8)", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<StripEditor label="Faixas" value="6:1, 3:1.5" onChange={onChange} params={custom} />);
    await userEvent.click(screen.getAllByRole("button", { name: /^Remover faixa/ })[0]);
    expect(onChange).toHaveBeenLastCalledWith("3:1.5");
    await userEvent.click(screen.getByRole("button", { name: "+ faixa" }));
    expect(onChange).toHaveBeenLastCalledWith("6:1, 3:1.5, 3:1");
    rerender(<StripEditor label="Faixas" value="4:1" onChange={onChange} params={custom} />);
    expect(screen.getByRole("button", { name: /^Remover faixa/ })).toBeDisabled();
    rerender(<StripEditor label="Faixas" value="1:1,1:1,1:1,1:1,1:1,1:1,1:1,1:1" onChange={onChange} params={custom} />);
    expect(screen.getByRole("button", { name: "+ faixa" })).toBeDisabled();
  });
});
