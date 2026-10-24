// @vitest-environment happy-dom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { takeIntent } from "../tools/intent";
import { worksWithoutAms } from "../tools/models/amsTable";
import { setCreateView } from "../tools/models/createView";
import { FILE_TOOL_GROUPS, PRODUCTS } from "../tools/models/products";
import { renderWithApp } from "../test/harness";
import Create from "./Create";

beforeEach(() => setCreateView({ tab: "all", q: "", occasion: null }));
const searchbox = () => screen.getByRole("searchbox", { name: "O que você quer criar?" });
const tabs = () => within(screen.getByRole("group", { name: "Categoria" }));
const fileTools = () => within(screen.getByRole("region", { name: "Mexer num arquivo 3D seu" })).getAllByRole("link");

test("Criar (#250): produtos com foto primeiro, ferramentas de arquivo em 3 grupos embaixo", () => {
  const { container } = renderWithApp(<Create go={vi.fn()} />);
  const sections = Array.from(container.querySelectorAll("section")).map((s) => s.querySelector("h2")!.textContent);
  // os produtos vêm antes de qualquer ferramenta
  expect(sections.slice(0, 7)).toEqual(["Chaveiros", "Placas", "Presentes e lembrancinhas", "Festa e esporte", "Casa e decoração", "Organização e utilidades", "Cozinha"]);
  expect(sections.slice(7)).toEqual(["Da imagem para a peça", "Mexer num arquivo 3D seu", "Não achou?"]);
  expect(container.querySelectorAll(".create-tools > li")).toHaveLength(13); // de 24 ferramentas soltas para 13
  // cada cartão tem o que resolve e quantos tipos
  const chaveiro = within(screen.getAllByRole("link").find((a) => a.getAttribute("data-product") === "keychain")!);
  expect(chaveiro.getByText("Chaveiro")).toBeInTheDocument();
  expect(chaveiro.getByText(/Chaveiro com nome, logo, NFC ou academia/)).toBeInTheDocument();
  expect(chaveiro.getByText(/13 tipos/)).toBeInTheDocument();
});

test("Criar: abas por categoria, 'Do seu arquivo' e 'Não achou?'; nenhuma ferramenta fica só em Tudo", async () => {
  const user = userEvent.setup();
  renderWithApp(<Create go={vi.fn()} />);
  expect(tabs().getAllByRole("button").map((b) => b.textContent)).toEqual(["Tudo", "Chaveiros", "Placas", "Presentes e lembrancinhas", "Festa e esporte", "Casa e decoração", "Organização e utilidades", "Cozinha", "Do seu arquivo", "Não achou?"]);
  await user.click(tabs().getByRole("button", { name: "Do seu arquivo" }));
  expect(fileTools().map((a) => a.getAttribute("data-page"))).toEqual(FILE_TOOL_GROUPS.filter((g) => g.tab === "file").flatMap((g) => g.pages).slice(2));
  await user.click(tabs().getByRole("button", { name: "Não achou?" }));
  expect(within(screen.getByRole("region", { name: "Não achou?" })).getAllByRole("link").map((a) => a.getAttribute("data-page"))).toEqual(["search3d", "ai", "scad"]);
  await user.click(tabs().getByRole("button", { name: "Cozinha" }));
  expect(screen.getAllByRole("link").some((a) => a.getAttribute("data-product") === "cutters")).toBe(true);
  expect(screen.queryByRole("link", { name: /Chaveiro/ })).not.toBeInTheDocument();
});

test("Criar: busca por sinônimo e pelo que a pessoa quer vender, sem acento, e abre a variação ou ferramenta que combina", async () => {
  const go = vi.fn();
  const user = userEvent.setup();
  renderWithApp(<Create go={go} />);
  const typed = async (q: string) => {
    await user.clear(searchbox());
    await user.type(searchbox(), q);
  };
  const first = () => screen.getAllByRole("link").find((a) => a.closest(".create-products"))!;
  await typed("anilha");
  await user.click(first());
  expect(takeIntent("models")).toEqual({ id: "gymKeychain" });
  await typed("chaveiro com nome"); // "com" não atrapalha: abre a ferramenta de nome em lote
  await user.click(first());
  expect(go).toHaveBeenLastCalledWith("keychain");
  await typed("dividir stl");
  await user.click(screen.getAllByRole("link").find((a) => a.getAttribute("data-page") === "bedcut")!);
  expect(go).toHaveBeenLastCalledWith("bedcut");
  await typed("topo de bolo");
  await user.click(first());
  expect(takeIntent("models")).toEqual({ id: "cake" });
  await typed("camiseta");
  await user.click(first());
  expect(takeIntent("models")).toEqual({ id: "shirtPrint" });
  await typed("zzzz");
  expect(screen.getByText(/Nada com “zzzz”/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pedir à IA" })).toBeInTheDocument();
});

test("Criar (#118): selo de AMS no cartão e filtro 'só 1 cor' dentro de Filtros", async () => {
  const user = userEvent.setup();
  renderWithApp(<Create go={vi.fn()} />);
  const cards = () => screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("#models/"));
  const all = cards().length;
  const need = (a: HTMLElement) => document.getElementById(a.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
  expect(cards().some((a) => need(a) === "Precisa de AMS (ou uma mesa por cor)")).toBe(true);
  await user.click(screen.getByText(/^Filtros/));
  await user.click(screen.getByRole("switch", { name: /Só 1 cor/ }));
  expect(cards().length).toBeGreaterThan(0);
  expect(cards().length).toBeLessThan(all);
  for (const a of cards()) expect(worksWithoutAms(a.getAttribute("href")!.slice("#models/".length))).toBe(true);
});

test("Criar: ocasião e favoritos moram aqui, como chips que filtram os produtos", async () => {
  const user = userEvent.setup();
  renderWithApp(<Create go={vi.fn()} />);
  await user.click(within(screen.getByRole("group", { name: "Ocasião" })).getByRole("button", { name: "Favoritos" }));
  expect(screen.getByText("Nenhum favorito ainda")).toBeInTheDocument();
  await user.click(within(screen.getByRole("group", { name: "Ocasião" })).getByRole("button", { name: /^Mais \(/ }));
  await user.click(within(screen.getByRole("group", { name: "Ocasião" })).getByRole("button", { name: "Dia das Mães" }));
  expect(screen.getByRole("heading", { name: "Para Dia das Mães" })).toBeInTheDocument();
  expect(screen.getAllByRole("link").length).toBeGreaterThan(3);
});

test("Criar: todo cartão de produto abre a entrada que ele mostra (modelo certo ou ferramenta certa)", async () => {
  const go = vi.fn();
  const user = userEvent.setup();
  const { container } = renderWithApp(<Create go={go} />);
  await screen.findByRole("heading", { name: "Criar", level: 1 });
  const cards = Array.from(container.querySelectorAll<HTMLAnchorElement>(".create-products a"));
  expect(cards.map((c) => c.dataset.product).sort()).toEqual(PRODUCTS.map((p) => p.id).sort()); // nenhum produto sumiu
  const wrong: string[] = [];
  for (const card of cards) {
    const product = PRODUCTS.find((p) => p.id === card.dataset.product)!;
    go.mockClear();
    for (const page of ["models", "lithophane", "keychain", "medal", "pixel", "invite", "thermoform", "cutter", "stamp", "qr"]) takeIntent(page);
    await user.click(card);
    const href = card.getAttribute("href")!;
    const toModel = href.startsWith("#models/");
    const id = href.replace("#models/", "").replace("#", "");
    if (toModel && !product.entries.some((e) => e.kind === "model" && e.id === id)) wrong.push(`${product.id}: o cartão aponta para ${id}, que não é do produto`);
    if (!toModel && !product.entries.some((e) => e.kind === "tool" && e.page === id)) wrong.push(`${product.id}: o cartão aponta para a ferramenta ${id}, que não é do produto`);
    const target = toModel && id === "shadowbox" ? "lithophane" : toModel ? "models" : id;
    if (go.mock.lastCall?.[0] !== target) wrong.push(`${product.id}: foi para ${String(go.mock.lastCall?.[0])}, devia ir para ${target}`);
  }
  expect(wrong).toEqual([]);
});
