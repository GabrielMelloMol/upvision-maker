// @vitest-environment happy-dom
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, test, vi } from "vitest";
import { setupTauri } from "../test/harness";
import { CHANGELOG, useWhatsNewAfterUpdate, WhatsNewModal } from "./WhatsNew";

const t = setupTauri();
const lastSeen = async () => (await t.db.select<{ value: string }>("SELECT value FROM secrets WHERE key = 'last_seen_version'"))[0]?.value;

describe("WhatsNewModal", () => {
  test("lista versões e itens, com **negrito** virando <strong> sem HTML cru", async () => {
    const onClose = vi.fn();
    render(<WhatsNewModal entries={[{ version: "9.0.0", date: "2026-10-01", items: ["**Novo**: <b>teste</b>", "Simples"] }]} onClose={onClose} />);
    expect(screen.getByRole("heading", { name: /Versão 9.0.0/ })).toHaveTextContent("2026-10-01");
    expect(screen.getByText("Novo").tagName).toBe("STRONG");
    expect(screen.getByText(/<b>teste<\/b>/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entendi" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Entendi" }));
    expect(onClose).toHaveBeenCalled();
  });

  test("o CHANGELOG do projeto é lido na carga do módulo", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    expect(CHANGELOG[0].items.length).toBeGreaterThan(0);
  });
});

describe("useWhatsNewAfterUpdate", () => {
  test("primeira instalação: não mostra nada e registra a versão", async () => {
    const { result } = renderHook(() => useWhatsNewAfterUpdate());
    await waitFor(async () => expect(await lastSeen()).toBe("0.3.0"));
    expect(result.current[0]).toEqual([]);
  });

  test("depois de atualizar: mostra só as versões novas e fechar esvazia", async () => {
    await t.db.execute("INSERT INTO secrets (key, value) VALUES ('last_seen_version', '0.1.0')");
    const { result } = renderHook(() => useWhatsNewAfterUpdate());
    await waitFor(() => expect(result.current[0].length).toBeGreaterThan(0));
    expect(result.current[0].map((e) => e.version)).not.toContain("0.1.0");
    expect(await lastSeen()).toBe("0.3.0");
    act(() => result.current[1]());
    expect(result.current[0]).toEqual([]);
  });

  test("falha ao ler a versão só avisa no console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    t.handlers["plugin:app|version"] = () => {
      throw new Error("x");
    };
    const { result } = renderHook(() => useWhatsNewAfterUpdate());
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(result.current[0]).toEqual([]);
    warn.mockRestore();
  });
});
