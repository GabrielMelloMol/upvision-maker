// @vitest-environment happy-dom
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PAGES } from "../pages";
import { renderWithApp, setupTauri } from "../test/harness";
import { takePendingOpen } from "../ui/search";
import DesignCatalog from "./DesignCatalog";
import Home, { ago } from "./Home";

const t = setupTauri();

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

describe("Home (#139)", () => {
  test.each([
    [9, "Bom dia"],
    [14, "Boa tarde"],
    [21, "Boa noite"],
  ])("às %ih cumprimenta com '%s'", (h, text) => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 28, h) });
    renderWithApp(<Home go={() => {}} />);
    expect(screen.getByRole("heading", { name: text, level: 1 })).toBeInTheDocument();
  });

  test("cinco ações; o rascunho aparece em Meus projetos e os prazos da semana abrem o pedido", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 28, 14) });
    await t.db.execute("INSERT INTO tool_state (id, data, updatedAt) VALUES ('keychain', '{}', ?)", [new Date(2026, 8, 28, 12).toISOString()]);
    await t.db.execute("INSERT INTO orders (customerName, channel, status, dueDate, createdAt) VALUES ('Ana', 'Loja', 'pending', '2026-09-30', '2026-09-20 10:00:00'), ('Bia', 'Loja', 'pending', '2026-12-01', '2026-09-20 10:00:00')");
    const go = vi.fn();
    renderWithApp(<Home go={go} />);
    const user = userEvent.setup();
    expect(within(screen.getByRole("list", { name: "Começar" })).getAllByRole("button")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Calcular preço" }));
    await user.click(await screen.findByRole("button", { name: /Chaveiros · rascunho há 2 horas/ }));
    const week = screen.getByRole("heading", { name: "Esta semana" }).closest("section")!;
    expect(within(week).queryByText("Bia")).not.toBeInTheDocument(); // prazo fora da semana
    await user.click(within(week).getByRole("button", { name: /Ana/ }));
    expect(go.mock.calls).toEqual([["calculator"], ["keychain"], ["orders"]]);
    expect(takePendingOpen("orders")).toBe(1);
  });

  test("ago: minutos, horas e dias", () => {
    const now = Date.parse("2026-09-28T12:00:00Z");
    expect(ago("2026-09-28T11:55:00Z", now)).toBe("há 5 minutos");
    expect(ago("2026-09-28T09:00:00Z", now)).toBe("há 3 horas");
    expect(ago("2026-09-27T09:00:00Z", now)).toBe("ontem");
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
