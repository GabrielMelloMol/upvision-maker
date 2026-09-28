// @vitest-environment happy-dom
import { renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Onboarding, { useFirstRun } from "./Onboarding";

const t = setupTauri();
const done = async () => (await t.db.select<{ value: string }>("SELECT value FROM secrets WHERE key = 'onboarding_done'"))[0]?.value;

describe("useFirstRun", () => {
  test("banco vazio e sem ter visto: mostra; fechar registra", async () => {
    const { result } = renderHook(() => useFirstRun());
    await waitFor(() => expect(result.current[0]).toBe(true));
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    await waitFor(async () => expect(await done()).toBe("1"));
  });

  test("quem já tem impressora não vê e fica registrado", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('A1', 95)");
    const { result } = renderHook(() => useFirstRun());
    await waitFor(async () => expect(await done()).toBe("1"));
    expect(result.current[0]).toBe(false);
  });

  test("já visto: não mostra", async () => {
    await t.db.execute("INSERT INTO secrets (key, value) VALUES ('onboarding_done', '1')");
    const { result } = renderHook(() => useFirstRun());
    await waitFor(() => expect(t.calls.filter((c) => c === "plugin:sql|select").length).toBeGreaterThan(0));
    expect(result.current[0]).toBe(false);
  });

  test("erro no banco só avisa no console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    t.handlers["plugin:sql|select"] = () => {
      throw new Error("x");
    };
    const { result } = renderHook(() => useFirstRun());
    await waitFor(() => expect(warn).toHaveBeenCalledWith("Não foi possível verificar o primeiro uso:", expect.any(Error)));
    t.handlers["plugin:sql|execute"] = () => {
      throw new Error("y");
    };
    act(() => result.current[1]());
    await waitFor(() => expect(warn).toHaveBeenCalledWith("Não foi possível registrar a apresentação:", expect.any(Error)));
    warn.mockRestore();
  });
});

describe("Onboarding", () => {
  test("passo 2: impressora pelo catálogo (#1)", async () => {
    const user = userEvent.setup();
    renderWithApp(<Onboarding onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Passo 2 de 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Escolher do catálogo" }));
    const sheet = await screen.findByRole("dialog", { name: "Catálogo de impressoras" });
    await user.click(within(sheet).getByRole("option", { name: /^A1 mini/ }));
    expect(screen.getByLabelText(/^Nome/)).toHaveValue("Bambu Lab A1 mini");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Passo 3 de 3")).toBeInTheDocument();
    expect(await t.db.select("SELECT name, watts FROM printers")).toEqual([{ name: "Bambu Lab A1 mini", watts: 80 }]);
  });

  test("3 passos gravam custos, impressora e filamento; ao concluir agradece e fecha", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<Onboarding onClose={onClose} />);

    expect(screen.getByText("Passo 1 de 3")).toBeInTheDocument();
    const kwh = screen.getByLabelText("Preço do kWh");
    expect(kwh).toHaveFocus();
    await user.clear(kwh);
    await user.type(kwh, "1,10");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Passo 2 de 3")).toBeInTheDocument();
    const [settings] = await t.db.select<{ data: string }>("SELECT data FROM settings");
    expect(JSON.parse(settings.data)).toMatchObject({ kwhPrice: 1.1, laborHourCost: 0 });

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Obrigatório.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Nome/), "Bambu A1");
    await user.type(screen.getByLabelText(/^Potência média/), "95");
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByText("Passo 3 de 3")).toBeInTheDocument();
    expect(await t.db.select("SELECT name, watts FROM printers")).toEqual([{ name: "Bambu A1", watts: 95 }]);

    await user.selectOptions(screen.getByLabelText("Material"), "PETG");
    await user.click(screen.getByRole("radio", { name: "Azul" }));
    await user.type(screen.getByLabelText("Preço por kg"), "120");
    await user.click(screen.getByRole("button", { name: "Concluir" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await t.db.select("SELECT material, color, pricePerKg, stockG FROM filaments")).toEqual([{ material: "PETG", color: "Azul", pricePerKg: 120, stockG: 1000 }]);
    expect(screen.getByRole("status")).toHaveTextContent("Tudo pronto!");
  });

  test("Pular avança sem gravar; 'Agora não' fecha", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<Onboarding onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Pular" }));
    await user.click(screen.getByRole("button", { name: "Pular" }));
    expect(screen.getByText("Passo 3 de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Concluir" })).toBeInTheDocument();
    expect(await t.db.select("SELECT * FROM printers")).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Agora não" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("erro que não é de campo aparece embaixo do passo", async () => {
    t.handlers["plugin:sql|select"] = () => {
      throw new Error("banco travado");
    };
    const user = userEvent.setup();
    renderWithApp(<Onboarding onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("banco travado")).toBeInTheDocument();
    expect(screen.getByText("Passo 1 de 3")).toBeInTheDocument();
  });
});
