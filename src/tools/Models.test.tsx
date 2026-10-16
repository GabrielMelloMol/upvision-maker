// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import Models from "./Models";
import { openWith } from "./intent";
import { CATEGORIES, MODELS } from "./models/defs";

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
const variations = () => within(screen.getByRole("group", { name: "Variação" }));
/** A Criar abre o modelo pedindo pelo id (#250); o editor não tem mais galeria própria. */
const open = (id?: string) => {
  if (id) openWith("models", { id });
  return renderWithApp(<Models />);
};

describe("Modelos prontos", () => {
  test("todo modelo tem categoria válida e id único", () => {
    const ids = new Set(MODELS.map((m) => m.id));
    expect(ids.size).toBe(MODELS.length);
    for (const m of MODELS) expect(CATEGORIES.map(([c]) => c)).toContain(m.category);
  });

  test("o editor não tem galeria própria: só o modelo e o 'Todos os produtos' que volta para a Criar (#250)", () => {
    open("pix");
    expect(screen.queryByRole("group", { name: "Família" })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Buscar modelo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Todos os produtos" })).toBeInTheDocument();
  });

  test("variação da família: miniatura com rótulo, grupos no chaveiro, texto digitado vai junto (#141)", async () => {
    const user = userEvent.setup();
    open("logoKeychain");
    expect(screen.getByText("Com arte")).toBeInTheDocument();
    expect(screen.getByText("Com função")).toBeInTheDocument();
    expect(variations().getByRole("button", { name: "Nome em lote" })).toBeInTheDocument(); // atalho da ferramenta Chaveiros
    await user.click(variations().getByRole("button", { name: "Anilha" }));
    expect(variations().getByRole("button", { name: "Anilha" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Chaveiro anilha" })).toBeInTheDocument();
  });

  test("UX B2: o painel mostra o nome da família do card antes do título do modelo; atalho de outra ferramenta avisa", () => {
    open("puzzle");
    // o card se chama Brinquedos e o painel abre Quebra-cabeça: o painel mostra de qual card veio
    expect(screen.getByRole("heading", { name: "Quebra-cabeça" })).toBeInTheDocument();
    expect(document.querySelector(".model-family")).toHaveTextContent("Brinquedos");
    cleanup();
    open("adaptiveMedal");
    expect(document.querySelector(".model-family")).toHaveTextContent("Medalha");
    expect(variations().getByRole("button", { name: "Redonda" })).toHaveAttribute("title", "Abre a ferramenta Medalhas, em outra tela");
  });

  test("dado obrigatório faltando aparece como prévia vazia, não como erro", async () => {
    const user = userEvent.setup();
    open("pix");
    expect(variations().getByRole("button", { name: "Pix" })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText(/Falta a chave Pix/, undefined, BUILD)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    cleanup();
    open("adaptivePlate");
    // modelo que exige desenho abre com o desenho de exemplo: já tem prévia, sem pedir nada antes
    expect(await screen.findByRole("button", { name: "Remover desenho" }, BUILD)).toBeInTheDocument();
    expect(screen.getByText(/Desenho de exemplo \(um coração\)/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Envie um desenho/)).not.toBeInTheDocument(), BUILD);
    // quem remove o exemplo volta ao estado vazio (e ele não reaparece sozinho), com o botão para usá-lo de novo
    await user.click(screen.getByRole("button", { name: "Remover desenho" }));
    expect(await screen.findByText(/Envie um desenho/, undefined, BUILD)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Usar um desenho de exemplo" }));
    expect(await screen.findByRole("button", { name: "Remover desenho" }, BUILD)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usar um desenho de exemplo" })).not.toBeInTheDocument();
  }, 30_000);

  test("favoritos: a estrela guarda o modelo aberto (e fica salvo para o chip da Criar)", async () => {
    localStorage.removeItem("upvision.favoriteModels");
    const user = userEvent.setup();
    open("pix");
    await user.click(screen.getByRole("button", { name: `Favoritar ${MODELS[0].label}` }));
    expect(JSON.parse(localStorage.getItem("upvision.favoriteModels")!)).toEqual([MODELS[0].id]);
    await user.click(screen.getByRole("button", { name: `Tirar ${MODELS[0].label} dos favoritos` }));
    expect(JSON.parse(localStorage.getItem("upvision.favoriteModels")!)).toEqual([]);
  });

  test("variação pronta preenche os campos do modelo", async () => {
    const user = userEvent.setup();
    open("cake");
    await user.click(within(screen.getByRole("group", { name: "Variações prontas" })).getByRole("button", { name: "Casamento" }));
    expect(screen.getByLabelText("Linha principal")).toHaveValue("Ana & Leo");
    expect(screen.getByLabelText(/Segunda linha/)).toHaveValue("12.12.2026");
  });
});
