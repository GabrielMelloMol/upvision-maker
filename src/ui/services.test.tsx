// @vitest-environment happy-dom
import { renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { getDb } from "../db";
import type { Db } from "../db/types";
import { setupTauri } from "../test/harness";
import { saveFile, slug } from "./saveFile";
import { loadSearchItems, SEARCH_SOURCES, setPendingOpen, takePendingOpen } from "./search";
import { installShortcuts, isMac, modKey, onNewShortcut } from "./shortcuts";
import { ToastProvider } from "./Toast";
import { useData } from "./useData";

const t = setupTauri();
const key = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, ...init }));

describe("atalhos globais", () => {
  test("Cmd/Ctrl+K abre a busca; Cmd/Ctrl+N avisa a página; com Alt/Shift ou sem modificador nada acontece", () => {
    const openPalette = vi.fn();
    const onNew = vi.fn();
    const stop = installShortcuts({ openPalette });
    const unsub = onNewShortcut(onNew);

    key({ key: "k", metaKey: true });
    key({ key: "K", ctrlKey: true });
    key({ key: "n", ctrlKey: true });
    key({ key: "k" });
    key({ key: "k", ctrlKey: true, shiftKey: true });
    key({ key: "n", metaKey: true, altKey: true });
    key({ key: "x", ctrlKey: true });

    expect(openPalette).toHaveBeenCalledTimes(2);
    expect(onNew).toHaveBeenCalledTimes(1);
    stop();
    unsub();
    key({ key: "k", metaKey: true });
    key({ key: "n", metaKey: true });
    expect(openPalette).toHaveBeenCalledTimes(2);
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  test("modKey mostra ⌘ no Mac e Ctrl no resto", () => {
    const spy = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    expect(isMac()).toBe(true);
    expect(modKey()).toBe("⌘");
    spy.mockReturnValue("Win32");
    expect(modKey()).toBe("Ctrl");
    spy.mockRestore();
  });
});

describe("saveFile", () => {
  test("texto é gravado em UTF-8 no caminho escolhido, com o filtro da extensão", async () => {
    let filterArgs: unknown;
    t.handlers["plugin:dialog|save"] = (a) => {
      filterArgs = a.options;
      return "/saida/peça.svg";
    };

    const path = await saveFile("peça.svg", "<svg/>", "svg", "SVG");

    expect(path).toBe("/saida/peça.svg");
    expect(new TextDecoder().decode(t.files.get("/saida/peça.svg"))).toBe("<svg/>");
    expect(filterArgs).toMatchObject({ defaultPath: "peça.svg", filters: [{ name: "SVG", extensions: ["svg"] }] });
  });

  test("bytes vão como estão; cancelar devolve null sem gravar", async () => {
    expect(await saveFile("a.stl", new Uint8Array([1, 2, 3]), "stl", "STL")).toBe("/saida/a.stl");
    expect([...t.files.get("/saida/a.stl")!]).toEqual([1, 2, 3]);
    t.savePath = () => null;
    expect(await saveFile("b.stl", "x", "stl", "STL")).toBeNull();
    expect(t.files.has("/saida/b.stl")).toBe(false);
  });

  test("slug tira acentos e símbolos; vazio vira 'modelo'", () => {
    expect(slug("  Chaveiro São João! ")).toBe("chaveiro-sao-joao");
    expect(slug("***")).toBe("modelo");
  });
});

describe("loadSearchItems", () => {
  test("reúne registros de todas as fontes com página e id para abrir", async () => {
    await t.db.execute("INSERT INTO filaments (material, color, brand, pricePerKg, stockG) VALUES ('PLA', 'Preto', 'Voolt', 100, 1500)");
    await t.db.execute("INSERT INTO materials (name, unit, unitPrice) VALUES ('Argola', 'un', 0.5)");
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('A1', 95)");
    await t.db.execute(`INSERT INTO products (name, composition, sku, notes) VALUES ('Vaso', '{"filaments":[],"materials":[],"items":[]}', 'V1', 'decoração')`);
    await t.db.execute("INSERT INTO customers (name, phone, city, email) VALUES ('Ana', '1199', 'Santos', 'ana@x.com')");
    await t.db.execute("INSERT INTO orders (customerName, channel, dueDate, createdAt) VALUES ('Ana', 'direct', '2026-10-05', '2026-09-28')");

    const items = await loadSearchItems(await getDb());

    const by = (g: string) => items.find((i) => i.group === g);
    expect(by("Filamentos")).toMatchObject({ title: "PLA Preto", subtitle: "Voolt · 1.500 g", pageId: "filaments", recordId: 1 });
    expect(by("Materiais extras")).toMatchObject({ title: "Argola", subtitle: "un", pageId: "materials" });
    expect(by("Impressoras")).toMatchObject({ title: "A1", subtitle: "95 W", pageId: "printers" });
    expect(by("Produtos")).toMatchObject({ title: "Vaso", subtitle: "V1", keywords: "decoração", pageId: "products" });
    expect(by("Clientes")).toMatchObject({ title: "Ana", subtitle: "1199 · Santos", pageId: "customers" });
    expect(by("Pedidos")).toMatchObject({ title: "Pedido #1 · Ana", pageId: "orders", recordId: 1 });
    expect(by("Pedidos")?.subtitle).toContain("prazo 05/10/2026");
  });

  test("uma fonte com erro não derruba as outras", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('A1', 95)");
    const broken: Db = { select: async () => Promise.reject(new Error("tabela sumiu")), execute: async () => ({ rowsAffected: 0, lastInsertId: 0 }), batch: async () => {} };
    const real = await getDb();
    const flaky: Db = { select: (sql, p) => (/printers/.test(sql) ? real.select(sql, p) : broken.select(sql, p)), execute: real.execute, batch: real.batch };

    const items = await loadSearchItems(flaky);

    expect(items.map((i) => i.title)).toEqual(["A1"]);
    expect(SEARCH_SOURCES.length).toBeGreaterThan(1);
  });

  test("pedido pendente de abertura é consumido uma vez só e só pela página certa", () => {
    setPendingOpen({ pageId: "printers", recordId: 3 });
    expect(takePendingOpen("filaments")).toBeNull();
    expect(takePendingOpen("printers")).toBe(3);
    expect(takePendingOpen("printers")).toBeNull();
  });
});

describe("useData", () => {
  const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

  test("carrega, fica pronto e relê com reload", async () => {
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('A1', 95)");
    const load = async (db: Db) => (await db.select<{ name: string }>("SELECT name FROM printers")).map((r) => r.name);
    const { result } = renderHook(() => useData(load, [] as string[]), { wrapper });
    expect(result.current[2]).toBe(true);
    await waitFor(() => expect(result.current[2]).toBe(false));
    expect(result.current[0]).toEqual(["A1"]);

    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('X1', 300)");
    result.current[1]();
    await waitFor(() => expect(result.current[0]).toEqual(["A1", "X1"]));
  });

  test("erro na leitura vira toast de erro e encerra o carregamento", async () => {
    const load = async () => {
      throw new Error("disco cheio");
    };
    const { result } = renderHook(() => useData(load, 0), { wrapper });
    expect(await screen.findByRole("alert")).toHaveTextContent("Erro ao carregar dados: disco cheio");
    expect(result.current[2]).toBe(false);
    expect(result.current[0]).toBe(0);
  });
});
