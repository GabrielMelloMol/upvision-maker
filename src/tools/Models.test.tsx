// @vitest-environment happy-dom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Models from "./Models";
import { CATEGORIES, MODELS } from "./models/defs";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

setupTauri();

// fontes: o app busca a URL do bundle; aqui lê o arquivo do node_modules
beforeAll(() => {
  vi.stubGlobal("fetch", async (u: string) => {
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});
const BUILD = { timeout: 15_000 };
const gallery = () => within(screen.getByRole("group", { name: "Modelo" }));

describe("Modelos prontos", () => {
  test("todo modelo tem categoria válida e id único", () => {
    const ids = new Set(MODELS.map((m) => m.id));
    expect(ids.size).toBe(MODELS.length);
    for (const m of MODELS) expect(CATEGORIES.map(([c]) => c)).toContain(m.category);
  });

  test("categoria filtra a galeria e troca para o 1º modelo dela", async () => {
    const user = userEvent.setup();
    renderWithApp(<Models />);
    const first = MODELS[0];
    expect(gallery().getAllByRole("button")).toHaveLength(MODELS.filter((m) => m.category === first.category).length);
    await user.click(screen.getByRole("button", { name: "Cozinha" }));
    const kitchen = MODELS.filter((m) => m.category === "kitchen");
    expect(gallery().getAllByRole("button").map((b) => b.textContent)).toEqual(kitchen.map((m) => m.label));
    expect(gallery().getByRole("button", { name: kitchen[0].label })).toHaveAttribute("aria-pressed", "true");
  });

  test("busca ignora acento e procura em todas as categorias", async () => {
    const user = userEvent.setup();
    renderWithApp(<Models />);
    await user.type(screen.getByRole("searchbox", { name: "Buscar modelo" }), "trofeu");
    expect(gallery().getAllByRole("button").map((b) => b.textContent)).toEqual(["Troféu", "Troféu elegante", "Troféu adaptável"]);
    // buscando, nenhuma categoria fica marcada
    const cats = within(screen.getByRole("group", { name: "Categoria" })).getAllByRole("button");
    expect(cats.every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("searchbox", { name: "Buscar modelo" })).toHaveValue("");
    expect(cats.some((b) => b.getAttribute("aria-pressed") === "true")).toBe(true);
    await user.type(screen.getByRole("searchbox", { name: "Buscar modelo" }), "xyz");
    expect(screen.getByText("Nenhum modelo com “xyz”")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(screen.getByRole("searchbox", { name: "Buscar modelo" })).toHaveValue("");
  });

  test("dado obrigatório faltando aparece como prévia vazia, não como erro", async () => {
    const user = userEvent.setup();
    renderWithApp(<Models />);
    await user.click(screen.getByRole("button", { name: "Placas" }));
    await user.click(gallery().getByRole("button", { name: "Placa Pix" }));
    expect(await screen.findByText("Preencha a chave Pix para ver a placa.", undefined, BUILD)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(gallery().getByRole("button", { name: "Placa adaptável" }));
    expect(await screen.findByText(/Envie um desenho/, undefined, BUILD)).toBeInTheDocument();
  }, 30_000);
});
