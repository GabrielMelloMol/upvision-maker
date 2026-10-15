// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { DEFAULT_ORGANIZER } from "../../../geometry/models/organizer/params";
import DividerMap from "./DividerMap";

const params = (patch: object = {}) => ({ ...DEFAULT_ORGANIZER, ...patch }) as never;

describe("DividerMap", () => {
  test("resume o mapa no rótulo do grupo e desenha um retângulo por nicho", () => {
    render(<DividerMap label="Mapa" params={params({ outerW: 180, outerD: 120, cols: 5, rows: 4 })} />);
    expect(screen.getByRole("group", { name: /^Mapa das divisórias: 5 × 4 nichos, o menor com \d+ mm$/ })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Nicho /)).toHaveLength(20);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("o foco num nicho mostra a medida útil dele (também no title)", async () => {
    const { container } = render(<DividerMap label="Mapa" params={params({ outerW: 180, outerD: 120, cols: 5, rows: 4 })} />);
    // vão interno 175,2 × 115,2; divisória 2 → nicho de 33,4 × 27,3 mm (175,2 − 8) / 5 e (115,2 − 6) / 4
    await userEvent.tab();
    const live = screen.getAllByText(/úteis/)[0];
    expect(live).toHaveTextContent("Nicho: 33,4 × 27,3 mm úteis");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(container.querySelector("rect > title")).toHaveTextContent("33,4 × 27,3 mm");
  });

  test("passar o mouse mostra a medida e sair volta a dica", () => {
    render(<DividerMap label="Mapa" params={params({ outerW: 180, outerD: 120, cols: 5, rows: 4 })} />);
    const cell = screen.getAllByLabelText(/^Nicho /)[0];
    fireEvent.mouseEnter(cell);
    expect(screen.getByText(/úteis/)).toBeInTheDocument();
    fireEvent.mouseLeave(cell);
    expect(screen.getByText(/Passe o mouse/)).toBeInTheDocument();
  });

  test("nicho menor que o mínimo fica marcado e a mensagem do problema aparece como alerta", () => {
    const { container } = render(<DividerMap label="Mapa" params={params({ outerW: 80, outerD: 60, cols: 10, rows: 5 })} />);
    expect(container.querySelectorAll("[data-small]").length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent(/pequeno demais para pegar a peça/);
  });

  test("medidas inválidas não quebram a tela", () => {
    const { container } = render(<DividerMap label="Mapa" params={params({ outerW: Number.NaN })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
