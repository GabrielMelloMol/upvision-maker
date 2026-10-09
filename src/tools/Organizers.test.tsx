// @vitest-environment happy-dom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import { openWith, takeIntent } from "./intent";
import Organizers, { BIN_MODELS } from "./Organizers";

// as três ferramentas por dentro são testadas nos arquivos delas; aqui só a casca: escolha, abas, intents e memória
vi.mock("./DrawerOrganizer", () => ({ default: ({ embedded }: { embedded?: boolean }) => <section aria-label="conteúdo da gaveta" data-embedded={String(embedded)} /> }));
vi.mock("./ToolFit", () => ({ default: ({ embedded }: { embedded?: boolean }) => <section aria-label="conteúdo da foto" data-embedded={String(embedded)} /> }));
vi.mock("./Models", () => ({ default: ({ embedded }: { embedded?: { ids: readonly string[] } }) => <section aria-label="conteúdo das caixinhas" data-ids={embedded?.ids.join(",")} /> }));

setupTauri();
const KEY = "upvision.organizers.tab";
beforeEach(() => {
  localStorage.removeItem(KEY);
  takeIntent("organizers");
  takeIntent("models");
});

describe("Organizadores", () => {
  test("começa pela escolha: três pontos de partida, em linguagem de quem usa", async () => {
    renderWithApp(<Organizers />);
    expect(await screen.findByRole("heading", { level: 1, name: "Organizadores" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Como organizar" });
    expect(within(list).getAllByRole("button").map((b) => b.querySelector("strong")?.textContent)).toEqual(["Tenho a medida da gaveta", "Tenho as ferramentas para fotografar", "Quero caixinhas avulsas"]);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/conteúdo/)).not.toBeInTheDocument();
  });

  test.each([
    ["Tenho a medida da gaveta", "Pela medida da gaveta", "conteúdo da gaveta"],
    ["Tenho as ferramentas para fotografar", "Pela foto das ferramentas", "conteúdo da foto"],
    ["Quero caixinhas avulsas", "Caixinhas avulsas", "conteúdo das caixinhas"],
  ])("escolher '%s' abre a aba '%s' com a ferramenta dentro", async (choice, tab, content) => {
    const user = userEvent.setup();
    renderWithApp(<Organizers />);
    await user.click(await screen.findByRole("button", { name: new RegExp(`^${choice}`) }));
    expect(screen.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByLabelText(content)).toBeInTheDocument();
    // o tabpanel está ligado à aba escolhida
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName(tab);
  });

  test("a ferramenta aberta numa aba vem sem o título próprio (embutida), e as caixinhas só com os 4 modelos Gridfinity avulsos", async () => {
    const user = userEvent.setup();
    renderWithApp(<Organizers />);
    await user.click(await screen.findByRole("button", { name: /^Tenho a medida/ }));
    expect(await screen.findByLabelText("conteúdo da gaveta")).toHaveAttribute("data-embedded", "true");
    await user.click(screen.getByRole("tab", { name: "Pela foto das ferramentas" }));
    expect(await screen.findByLabelText("conteúdo da foto")).toHaveAttribute("data-embedded", "true");
    await user.click(screen.getByRole("tab", { name: "Caixinhas avulsas" }));
    expect((await screen.findByLabelText("conteúdo das caixinhas")).getAttribute("data-ids")).toBe(BIN_MODELS.join(","));
    expect(BIN_MODELS).toEqual(["gridBin", "gridBase", "gridDrawerBase", "gridTest"]);
  });

  test("quem chega com uma aba pedida (atalho, Veja também, Meus projetos, busca) cai direto nela, sem a escolha", async () => {
    openWith("organizers", { tab: "photo" });
    renderWithApp(<Organizers />);
    expect(await screen.findByLabelText("conteúdo da foto")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pela foto das ferramentas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("list", { name: "Como organizar" })).not.toBeInTheDocument();
  });

  test("o pedido de aba vale uma vez, mas a tela refeita logo depois (remontagem) abre na mesma aba", async () => {
    openWith("organizers", { tab: "photo" });
    const first = renderWithApp(<Organizers />);
    expect(await screen.findByLabelText("conteúdo da foto")).toBeInTheDocument();
    expect(takeIntent("organizers")).toBeUndefined(); // consumido
    first.unmount();
    renderWithApp(<Organizers />); // sem novo pedido
    expect(await screen.findByLabelText("conteúdo da foto")).toBeInTheDocument();
  });

  test("a aba 'Caixinhas' pedida com um modelo abre esse modelo nos Modelos prontos embutidos", async () => {
    openWith("organizers", { tab: "bins", model: "gridDrawerBase" });
    renderWithApp(<Organizers />);
    expect(await screen.findByLabelText("conteúdo das caixinhas")).toBeInTheDocument();
    expect(takeIntent("models")).toEqual({ id: "gridDrawerBase" });
  });

  test("lembra a última aba: na próxima vez abre nela, e 'Ver as opções' volta à escolha", async () => {
    const user = userEvent.setup();
    const first = renderWithApp(<Organizers />);
    await user.click(await screen.findByRole("button", { name: /^Quero caixinhas/ }));
    expect(localStorage.getItem(KEY)).toBe("bins");
    first.unmount();
    renderWithApp(<Organizers />);
    expect(await screen.findByLabelText("conteúdo das caixinhas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver as opções" }));
    expect(screen.getByRole("list", { name: "Como organizar" })).toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("abas pelo teclado: setas, Home e End movem e selecionam; só a aba escolhida entra na ordem do Tab", async () => {
    openWith("organizers", { tab: "drawer" });
    const user = userEvent.setup();
    renderWithApp(<Organizers />);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    tabs[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(tabs[2]).toHaveFocus();
    await user.keyboard("{ArrowRight}"); // dá a volta
    expect(tabs[0]).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(tabs[2]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();
    await waitFor(() => expect(screen.getByLabelText("conteúdo da gaveta")).toBeInTheDocument());
  });

  test("sem armazenamento local, começa pela escolha e funciona do mesmo jeito", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const user = userEvent.setup();
    renderWithApp(<Organizers />);
    await user.click(await screen.findByRole("button", { name: /^Tenho a medida/ }));
    expect(await screen.findByLabelText("conteúdo da gaveta")).toBeInTheDocument();
    spy.mockRestore();
    set.mockRestore();
  });
});
