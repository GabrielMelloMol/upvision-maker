// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Models from "./Models";
import { CATEGORIES, MODELS } from "./models/defs";
import { familiesIn, familyOf, modelOf } from "./models/families";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));

setupTauri();

// fontes: o app busca a URL do bundle; aqui lê o arquivo do node_modules
beforeAll(() => {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (u: string) => {
    if (u.startsWith("data:")) return realFetch(u); // o desenho de exemplo vem embutido no bundle
    const b = readFileSync(resolve(__dirname, "../..", `.${u}`));
    return { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  });
});
const BUILD = { timeout: 30_000 };
const gallery = () => within(screen.getByRole("group", { name: "Modelo" }));
const families = () => within(screen.getByRole("group", { name: "Família" }));
const variations = () => within(screen.getByRole("group", { name: "Variação" }));

describe("Modelos prontos", () => {
  test("todo modelo tem categoria válida e id único", () => {
    const ids = new Set(MODELS.map((m) => m.id));
    expect(ids.size).toBe(MODELS.length);
    for (const m of MODELS) expect(CATEGORIES.map(([c]) => c)).toContain(m.category);
  });

  test("categoria mostra um card por família e troca para a 1ª variação da 1ª família (#141)", async () => {
    const user = userEvent.setup();
    renderWithApp(<Models />);
    const first = familyOf(MODELS[0].id);
    expect(families().getAllByRole("button").map((b) => b.textContent)).toEqual(familiesIn(first.category).map((f) => f.label));
    await user.click(screen.getByRole("button", { name: "Cozinha" }));
    const kitchen = familiesIn("kitchen");
    expect(families().getAllByRole("button").map((b) => b.textContent)).toEqual(kitchen.map((f) => f.label));
    expect(families().getByRole("button", { name: kitchen[0].label })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: modelOf(kitchen[0].variants[0].id).label })).toBeInTheDocument();
  });

  test("variação da família: miniatura com rótulo, grupos no chaveiro, texto digitado vai junto (#141)", async () => {
    const user = userEvent.setup();
    renderWithApp(<Models />);
    await user.click(screen.getByRole("button", { name: "Chaveiros" }));
    await user.click(families().getByRole("button", { name: "Chaveiro" }));
    expect(screen.getByText("Com arte")).toBeInTheDocument();
    expect(screen.getByText("Com função")).toBeInTheDocument();
    expect(variations().getByRole("button", { name: "Nome em lote" })).toBeInTheDocument(); // atalho da ferramenta Chaveiros
    await user.click(variations().getByRole("button", { name: "Anilha" }));
    expect(variations().getByRole("button", { name: "Anilha" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Chaveiro anilha" })).toBeInTheDocument();
    // buscando pelo nome antigo acha o modelo e diz a família
    await user.type(screen.getByRole("searchbox", { name: "Buscar modelo" }), "anilha");
    expect(gallery().getByRole("button", { name: "Chaveiro anilha" })).toHaveAttribute("title", expect.stringMatching(/^Chaveiro · /));
  });

  test("UX B2: o painel mostra o nome da família do card antes do título do modelo; atalho de outra ferramenta avisa", async () => {
    const user = userEvent.setup();
    renderWithApp(<Models />);
    await user.click(screen.getByRole("button", { name: "Casa e decoração" }));
    await user.click(families().getByRole("button", { name: "Brinquedos" }));
    // o card se chama Brinquedos e o painel abre Quebra-cabeça: o painel mostra de qual card veio
    expect(screen.getByRole("heading", { name: "Quebra-cabeça" })).toBeInTheDocument();
    expect(document.querySelector(".model-family")).toHaveTextContent("Brinquedos");
    await user.click(screen.getByRole("button", { name: "Festa e esporte" }));
    await user.click(families().getByRole("button", { name: "Medalha" }));
    expect(document.querySelector(".model-family")).toHaveTextContent("Medalha");
    expect(variations().getByRole("button", { name: "Redonda" })).toHaveAttribute("title", "Abre a ferramenta Medalhas, em outra tela");
  });

  test("UX B3: escolher um modelo na galeria leva a tela até os campos dele", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const user = userEvent.setup();
    renderWithApp(<Models />);
    await user.click(screen.getByRole("button", { name: "Cozinha" }));
    await user.click(families().getByRole("button", { name: familiesIn("kitchen")[1].label }));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect((scroll.mock.contexts.at(-1) as HTMLElement).className).toContain("tool-layout");
    // trocar a variação (já na altura dos campos) não rola de novo
    scroll.mockClear();
    const other = familiesIn("kitchen").find((f) => f.variants.length > 1);
    if (other) {
      await user.click(families().getByRole("button", { name: other.label }));
      scroll.mockClear();
      await user.click(variations().getByRole("button", { name: other.variants[1].label }));
      expect(scroll).not.toHaveBeenCalled();
    }
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
    await user.click(families().getByRole("button", { name: "Placa de balcão" }));
    expect(variations().getByRole("button", { name: "Pix" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("Preencha a chave Pix para ver a placa.", undefined, BUILD)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(families().getByRole("button", { name: "Placa" }));
    await user.click(variations().getByRole("button", { name: "No contorno" }));
    expect(await screen.findByText(/Envie um desenho/, undefined, BUILD)).toBeInTheDocument();
    // sem arte, dá para ver o modelo com um desenho de exemplo (UX M5)
    await user.click(screen.getByRole("button", { name: "Usar um desenho de exemplo" }));
    expect(await screen.findByRole("button", { name: "Remover desenho" }, BUILD)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Envie um desenho/)).not.toBeInTheDocument(), BUILD);
    expect(screen.queryByRole("button", { name: "Usar um desenho de exemplo" })).not.toBeInTheDocument();
  }, 30_000);

  test("ocasião filtra por todas as categorias e desmarca a categoria; clicar de novo volta", async () => {
    const user = userEvent.setup();
    renderWithApp(<Models />);
    const occ = within(screen.getByRole("group", { name: "Ocasião" }));
    await user.click(occ.getByRole("button", { name: "Dia das Mães" }));
    const names = gallery().getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(expect.arrayContaining(["Topo de bolo", "Marca-página", "Luminária"]));
    const cats = within(screen.getByRole("group", { name: "Categoria" })).getAllByRole("button");
    expect(cats.every((b) => b.getAttribute("aria-pressed") === "false")).toBe(true);
    await user.click(occ.getByRole("button", { name: "Dia das Mães" }));
    expect(cats.some((b) => b.getAttribute("aria-pressed") === "true")).toBe(true);
  });

  test("favoritos: vazio no começo; a estrela guarda o modelo aberto (e fica salvo)", async () => {
    localStorage.removeItem("upvision.favoriteModels");
    const user = userEvent.setup();
    renderWithApp(<Models />);
    const occ = within(screen.getByRole("group", { name: "Ocasião" }));
    await user.click(occ.getByRole("button", { name: /Favoritos/ }));
    expect(screen.getByText("Nenhum favorito ainda")).toBeInTheDocument();
    await user.click(occ.getByRole("button", { name: /Favoritos/ }));
    await user.click(screen.getByRole("button", { name: `Favoritar ${MODELS[0].label}` }));
    expect(JSON.parse(localStorage.getItem("upvision.favoriteModels")!)).toEqual([MODELS[0].id]);
    await user.click(occ.getByRole("button", { name: /Favoritos/ }));
    expect(gallery().getAllByRole("button").map((b) => b.textContent)).toEqual([MODELS[0].label]);
  });

  test("variação pronta preenche os campos do modelo", async () => {
    const user = userEvent.setup();
    renderWithApp(<Models />);
    await user.type(screen.getByRole("searchbox", { name: "Buscar modelo" }), "topo de bolo");
    await user.click(gallery().getByRole("button", { name: "Topo de bolo" }));
    await user.click(within(screen.getByRole("group", { name: "Variações prontas" })).getByRole("button", { name: "Casamento" }));
    expect(screen.getByLabelText("Linha principal")).toHaveValue("Ana & Leo");
    expect(screen.getByLabelText(/Segunda linha/)).toHaveValue("12.12.2026");
  });
});

