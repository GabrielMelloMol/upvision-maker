// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Home, Sparkles } from "lucide-react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import type { PageDef } from "../pages";
import { renderWithApp, setupTauri } from "../test/harness";
import CommandPalette from "./CommandPalette";
import Sheet from "./Sheet";

const t = setupTauri();
const cancel = (el: Element) => fireEvent(el, new Event("cancel", { cancelable: true }));

describe("Sheet", () => {
  function Opener({ onSubmit }: { onSubmit?: (e: React.FormEvent) => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Abrir</button>
        {open && (
          <Sheet title="Editar" icon={Sparkles} onClose={() => setOpen(false)} onSubmit={onSubmit} footer={<button type="submit">Enviar</button>} wide>
            <input aria-label="Nome" data-autofocus />
          </Sheet>
        )}
      </>
    );
  }

  test("abre como modal, foca o campo marcado e devolve o foco ao fechar pelo X", async () => {
    const user = userEvent.setup();
    render(<Opener />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Editar" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveClass("wide");
    expect(screen.getByLabelText("Nome")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  test("Esc (cancel) e clique no fundo fecham; clique dentro não", async () => {
    const user = userEvent.setup();
    render(<Opener />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    cancel(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    fireEvent.mouseDown(screen.getByLabelText("Nome"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("com onSubmit o corpo vira formulário (Enter envia)", async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const user = userEvent.setup();
    render(<Opener onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Abrir" }));
    await user.type(screen.getByLabelText("Nome"), "x{Enter}");
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

describe("CommandPalette", () => {
  const pages: PageDef[] = [
    { id: "home", label: "Início", group: "", icon: Home, render: () => null },
    { id: "calculator", label: "Calculadora", group: "Gestão", icon: Home, blurb: "Custo e preço", render: () => null },
    { id: "printers", label: "Impressoras", group: "Gestão", icon: Home, render: () => null },
  ];

  test("lista telas e registros; filtrar e Enter abre o registro", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Bambu A1', 95)");
    const onPick = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<CommandPalette pages={pages} onPick={onPick} onClose={() => {}} />);
    expect(await screen.findByRole("option", { name: /Bambu A1/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Calculadora/ })).toBeInTheDocument();

    const box = screen.getByRole("combobox");
    await user.type(box, "bambu");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ pageId: "printers", recordId: 1 }));
  });

  test("setas movem a seleção (com volta) e clique escolhe", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<CommandPalette pages={pages} onPick={onPick} onClose={() => {}} />);
    const box = screen.getByRole("combobox");
    const selected = () => screen.getAllByRole("option").find((o) => o.getAttribute("aria-selected") === "true");
    await waitFor(() => expect(selected()).toHaveTextContent("Início"));
    await user.click(box);
    await user.keyboard("{ArrowDown}");
    expect(selected()).toHaveTextContent("Calculadora");
    expect(box).toHaveAttribute("aria-activedescendant", "pal-page-calculator");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(selected()).toHaveTextContent("Impressoras");
    fireEvent.mouseMove(screen.getByRole("option", { name: /Início/ }));
    expect(selected()).toHaveTextContent("Início");
    await user.click(screen.getByRole("option", { name: /Calculadora/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ pageId: "calculator" }));
  });

  test("sem resultado mostra aviso; Enter e setas não fazem nada", async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<CommandPalette pages={pages} onPick={onPick} onClose={() => {}} />);
    await user.type(screen.getByRole("combobox"), "zzzz{ArrowDown}{Enter}");
    expect(screen.getByText(/Nada encontrado para “zzzz”/)).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  test("Esc e clique fora fecham", async () => {
    const onClose = vi.fn();
    renderWithApp(<CommandPalette pages={pages} onPick={() => {}} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Buscar" });
    cancel(dialog);
    fireEvent.mouseDown(dialog);
    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("leitura dos registros falhando: segue só com as telas", async () => {
    t.handlers["plugin:sql|select"] = () => {
      throw new Error("sem banco");
    };
    renderWithApp(<CommandPalette pages={pages} onPick={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(t.calls).toContain("plugin:sql|select"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Início", expect.stringContaining("Calculadora"), "Impressoras"]);
  });
});
