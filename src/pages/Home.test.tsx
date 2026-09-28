// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PAGES } from "../pages";
import { renderWithApp } from "../test/harness";
import DesignCatalog from "./DesignCatalog";
import Home from "./Home";

afterEach(() => void vi.useRealTimers());

describe("PAGES", () => {
  test("ids únicos, começa no Início e toda entrada monta um elemento", () => {
    const ids = PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("home");
    for (const p of PAGES) expect(isValidElement(p.render(() => {}))).toBe(true);
  });

  test("página interna de design só aparece em desenvolvimento", () => {
    expect(PAGES.some((p) => p.id === "design")).toBe(import.meta.env.DEV);
  });
});

describe("Home", () => {
  test.each([
    [9, "Bom dia"],
    [14, "Boa tarde"],
    [21, "Boa noite"],
  ])("às %ih cumprimenta com '%s'", (h, text) => {
    vi.useFakeTimers({ now: new Date(2026, 8, 28, h) });
    render(<Home go={() => {}} />);
    expect(screen.getByText(`${text}!`)).toBeInTheDocument();
  });

  test("um cartão por ferramenta e por tela de gestão; clicar navega", async () => {
    const go = vi.fn();
    render(<Home go={go} />);
    const cards = (title: string) => within(screen.getByRole("heading", { name: title }).parentElement!.nextElementSibling as HTMLElement).getAllByRole("button");
    expect(cards("Ferramentas")).toHaveLength(PAGES.filter((p) => p.group === "Ferramentas").length);
    expect(cards("Gestão")).toHaveLength(PAGES.filter((p) => p.group === "Gestão").length);
    await userEvent.click(screen.getByRole("button", { name: /Calculadora/ }));
    expect(go).toHaveBeenCalledWith("calculator");
  });
});

describe("DesignCatalog", () => {
  test("mostra tokens e componentes; controles de exemplo respondem", async () => {
    const user = userEvent.setup();
    renderWithApp(<DesignCatalog />);
    expect(screen.getByRole("heading", { name: "Design system", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("--accent")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Silhueta" }));
    expect(screen.getByRole("button", { name: "Silhueta" })).toHaveAttribute("aria-pressed", "true");
    const toggle = screen.getByRole("switch", { name: "Base por baixo" });
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    fireEvent.change(screen.getByRole("slider", { name: /Detalhe/ }), { target: { value: "70" } });
    expect(screen.getByText("70%")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: /Altura/ }), { target: { value: "20" } });
    expect(screen.getByText("Use entre 0,2 e 10.")).toBeInTheDocument();
  });

  test("botões de toast e o arquivo solto na dropzone viram avisos", async () => {
    const user = userEvent.setup();
    renderWithApp(<DesignCatalog />);
    await user.click(screen.getByRole("button", { name: "Toast ok" }));
    await user.click(screen.getByRole("button", { name: "Toast erro" }));
    fireEvent.drop(screen.getByRole("button", { name: /Arraste uma imagem/ }), { dataTransfer: { files: [new File(["x"], "a.png")] } });
    expect(await screen.findByText("Preferências salvas.")).toBeInTheDocument();
    expect(screen.getByText("Não foi possível salvar: disco cheio.")).toBeInTheDocument();
    expect(screen.getByText("Arquivo: a.png")).toBeInTheDocument();
  });

  test("abre e fecha o sheet de exemplo pelos dois botões", async () => {
    const user = userEvent.setup();
    renderWithApp(<DesignCatalog />);
    await user.click(screen.getByRole("button", { name: "Abrir sheet" }));
    expect(screen.getByRole("button", { name: "Confirmar" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir sheet" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
