// @vitest-environment happy-dom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { takeIntent } from "../tools/intent";
import { worksWithoutAms } from "../tools/models/amsTable";
import { FAMILIES } from "../tools/models/families";
import { renderWithApp } from "../test/harness";
import Create from "./Create";

const tools = () => within(screen.getByRole("region", { name: "Ferramentas" })).getAllByRole("link");

test("Criar (#139): busca sem acento, filtro por tipo e modelo pronto abre já escolhido", async () => {
  const go = vi.fn();
  const user = userEvent.setup();
  renderWithApp(<Create go={go} />);
  expect(tools().length).toBeGreaterThan(10);
  // um card por família (#141), não por modelo
  expect(screen.getAllByRole("link", { name: FAMILIES[0].label }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("link", { name: "Placa Pix" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "De um desenho ou foto" }));
  expect(tools().map((a) => a.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/^Cortador de biscoito/)]));
  expect(screen.queryByRole("link", { name: FAMILIES[0].label })).not.toBeInTheDocument(); // modelos só em Tudo e Personalizar

  await user.click(screen.getByRole("button", { name: "Tudo" }));
  await user.type(screen.getByRole("searchbox", { name: "Buscar ferramenta ou modelo" }), "medalha");
  expect(tools().map((a) => a.textContent)).toEqual([expect.stringMatching(/^Medalhas/)]);

  await user.clear(screen.getByRole("searchbox"));
  await user.type(screen.getByRole("searchbox"), "zzzz");
  expect(screen.getByText(/Nada com “zzzz”/)).toBeInTheDocument();

  // o nome antigo acha a família e abre na variação certa
  await user.clear(screen.getByRole("searchbox"));
  await user.type(screen.getByRole("searchbox"), "anilha");
  await user.click(screen.getByRole("link", { name: "Chaveiro" }));
  expect(go).toHaveBeenLastCalledWith("models");
  expect(takeIntent("models")).toEqual({ id: "gymKeychain" });
  await user.clear(screen.getByRole("searchbox"));
  await user.click(screen.getAllByRole("link", { name: "Troféu" })[0]);
  expect(takeIntent("models")).toEqual({ id: "trophy" });
  await user.click(tools()[0]);
  expect(go).toHaveBeenLastCalledWith("svg");
});

test("Criar (#118): selo de AMS no card e filtro 'Imprime sem troca automática de cor (AMS)'", async () => {
  const user = userEvent.setup();
  renderWithApp(<Create go={vi.fn()} />);
  const cards = () => screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("#models/"));
  const all = cards().length;
  const need = (a: HTMLElement) => document.getElementById(a.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
  expect(cards().some((a) => need(a) === "Precisa de AMS (ou uma mesa por cor)")).toBe(true);
  await user.click(screen.getByRole("switch", { name: "Imprime sem troca automática de cor (AMS)" }));
  expect(cards().length).toBeGreaterThan(0);
  expect(cards().length).toBeLessThan(all);
  for (const a of cards()) expect(worksWithoutAms(a.getAttribute("href")!.slice("#models/".length))).toBe(true);
});

test("Criar busca como a vendedora fala: camiseta, porta copos, geladeira, Dia das Mães, foto em relevo (onde fica)", async () => {
  const go = vi.fn();
  const user = userEvent.setup();
  renderWithApp(<Create go={go} />);
  const box = screen.getByRole("searchbox", { name: "Buscar ferramenta ou modelo" });
  const typed = async (q: string) => {
    await user.clear(box);
    await user.type(box, q);
  };
  await typed("camiseta");
  await user.click(screen.getByRole("link", { name: "Lembrancinhas" }));
  expect(takeIntent("models")).toEqual({ id: "shirtPrint" }); // abre na variação que achou

  await typed("porta copos"); // sem hífen
  expect(screen.getByRole("link", { name: "Porta-copos" })).toBeInTheDocument();

  await typed("geladeira");
  await user.click(screen.getByRole("link", { name: "Lembrancinhas" }));
  expect(takeIntent("models")).toEqual({ id: "fridgeMagnet" });

  await typed("Dia das Mães");
  expect(screen.getAllByRole("link").length).toBeGreaterThan(3); // as famílias dos modelos da coleção

  await typed("foto em relevo");
  expect(tools().map((a) => a.textContent)).toEqual([expect.stringMatching(/^Foto em relevo/)]);

  await typed("abajur");
  expect(screen.getByRole("link", { name: "Luminárias e abajures" })).toBeInTheDocument();
});

test("Criar: TODOS os cartões de modelo pronto levam ao modelo do próprio cartão (id do cartão, da família e da tela)", async () => {
  const go = vi.fn();
  const user = userEvent.setup();
  const { container } = renderWithApp(<Create go={go} />);
  await screen.findByRole("heading", { name: "Criar", level: 1 });
  const cards = () => Array.from(container.querySelectorAll<HTMLAnchorElement>(".create-models a"));
  const total = cards().length;
  expect(total).toBe(FAMILIES.length); // um cartão por família, nenhuma sumiu
  const wrong: string[] = [];
  for (let i = 0; i < total; i++) {
    const card = cards()[i];
    const want = card.getAttribute("href")!.replace("#models/", "");
    const family = FAMILIES.find((f) => f.id === card.dataset.family)!;
    if (!family.variants.some((v) => v.id === want)) wrong.push(`${family.id}: o cartão aponta para ${want}, que não é da família`);
    if (family.variants[0].id !== want) wrong.push(`${family.id}: sem busca o cartão devia abrir a 1ª variação (${family.variants[0].id}), abre ${want}`);
    go.mockClear();
    takeIntent("models");
    takeIntent("lithophane");
    await user.click(card);
    const tab = want === "shadowbox"; // virou aba da Foto em relevo
    const page = tab ? "lithophane" : "models";
    if (go.mock.lastCall?.[0] !== page) wrong.push(`${family.id}: foi para ${String(go.mock.lastCall?.[0])}, devia ir para ${page}`);
    const intent = takeIntent<{ id?: string; mode?: string }>(page);
    if (tab ? intent?.mode !== "shadowbox" : intent?.id !== want) wrong.push(`${family.id}: pedido ${JSON.stringify(intent)} em vez de ${want}`);
  }
  expect(wrong, "cartões que levam ao lugar errado").toEqual([]);
});

test("Criar: com busca, o cartão abre a variação que a busca achou (não a 1ª da família)", async () => {
  const go = vi.fn();
  const user = userEvent.setup();
  renderWithApp(<Create go={go} />);
  const box = screen.getByRole("searchbox", { name: "Buscar ferramenta ou modelo" });
  const cases: [string, string][] = [["anilha", "gymKeychain"], ["abajur", "tableLamp"], ["camiseta", "shirtPrint"], ["cumbuca", "outlineBowl"], ["dobrável", "phoneStandFold"], ["ejetor", "ejector"]];
  for (const [q, id] of cases) {
    await user.clear(box);
    await user.type(box, q);
    const link = document.querySelector<HTMLAnchorElement>(`.create-models a[href="#models/${id}"]`);
    expect(link, q).not.toBeNull();
    go.mockClear();
    await user.click(link!);
    expect(takeIntent("models"), q).toEqual({ id });
  }
});
