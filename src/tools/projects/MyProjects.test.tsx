// @vitest-environment happy-dom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { toolProjects, toolState } from "../../db/toolStateRepo";
import { renderWithApp, setupTauri } from "../../test/harness";
import { UNDO_MS } from "../../ui/CrudPage";
import { projectIntentKey, takeIntent } from "../intent";
import MyProjects from "./MyProjects";

vi.mock("../../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
const t = setupTauri();
const env = (state: object) => JSON.stringify({ v: 1, state });

async function seed() {
  const ana = await toolProjects.add(t.db, { toolId: "keychain", name: "Chaveiro Ana", data: env({ text: "Ana" }), thumb: "data:image/png;base64,AAAA", at: "2026-09-30T10:00:00Z" });
  await toolProjects.add(t.db, { toolId: "medal", name: "Formatura", data: env({}), thumb: null, at: "2026-09-20T10:00:00Z", tags: '["escola"]' });
  await toolState.save(t.db, { id: "qr", data: env({}), updatedAt: "2026-10-01T09:00:00Z" });
  return { ana };
}
const grid = () => within(screen.getByRole("list", { name: "Projetos" }));

describe("Meus projetos (#161)", () => {
  test("rascunho no topo com o selo; projetos com miniatura, ferramenta e data; abrir vai para a ferramenta com o projeto", async () => {
    const { ana } = await seed();
    const go = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<MyProjects go={go} />);
    const opens = await grid().findAllByRole("button", { name: /^Abrir / });
    expect(opens.map((b) => b.getAttribute("aria-label"))).toEqual(["Abrir Rascunho de QR Code e Pix", "Abrir Chaveiro Ana", "Abrir Formatura"]);
    expect(within(opens[0]).getByText("Rascunho")).toHaveClass("pill");
    expect(within(opens[1]).getByText(/Chaveiros · 30 de set/)).toBeInTheDocument();
    await user.click(opens[1]);
    expect(go).toHaveBeenLastCalledWith("keychain");
    expect(takeIntent(projectIntentKey("keychain"))).toEqual({ projectId: ana });
    await user.click(opens[0]);
    expect(takeIntent(projectIntentKey("qr"))).toEqual({ resume: true });
  });

  test("busca, filtro de tag e só favoritos; a estrela grava", async () => {
    const { ana } = await seed();
    const user = userEvent.setup();
    renderWithApp(<MyProjects go={vi.fn()} />);
    await grid().findByRole("button", { name: "Abrir Chaveiro Ana" });
    await user.type(screen.getByRole("searchbox", { name: "Buscar projeto" }), "medalhas");
    expect(grid().getAllByRole("button", { name: /^Abrir / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Abrir Formatura"]);
    await user.clear(screen.getByRole("searchbox", { name: "Buscar projeto" }));
    await user.selectOptions(screen.getByLabelText("Tag"), "escola");
    expect(grid().getAllByRole("button", { name: /^Abrir / })).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText("Tag"), "");
    await user.click(grid().getByRole("button", { name: "Favorito: Chaveiro Ana" }));
    await waitFor(async () => expect((await toolProjects.get(t.db, ana))!.favorite).toBe(1));
    await user.click(screen.getByRole("switch", { name: "Só favoritos" }));
    await waitFor(() => expect(grid().getAllByRole("button", { name: /^Abrir / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Abrir Chaveiro Ana"]));
  });

  test("⋯ › Renomear, tags e ligações grava; Fazer de novo cria a cópia e abre", async () => {
    const { ana } = await seed();
    await t.db.execute("INSERT INTO products (name) VALUES ('Chaveiro personalizado')").catch(() => undefined);
    const go = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<MyProjects go={go} />);
    await user.click(await grid().findByRole("button", { name: "Ações de Chaveiro Ana" }));
    await user.click(screen.getByRole("menuitem", { name: "Renomear e tags…" }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByLabelText("Nome"));
    await user.type(within(dialog).getByLabelText("Nome"), "Ana azul");
    await user.type(within(dialog).getByLabelText(/^Tags/), "escola, azul");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(async () => expect(await toolProjects.get(t.db, ana)).toMatchObject({ name: "Ana azul", tags: '["escola","azul"]' }));

    await user.click(await grid().findByRole("button", { name: "Ações de Ana azul" }));
    await user.click(screen.getByRole("menuitem", { name: "Fazer de novo" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("keychain"));
    const copy = (await toolProjects.all(t.db)).find((p) => p.name === "Ana azul (cópia)")!;
    expect(takeIntent(projectIntentKey("keychain"))).toEqual({ projectId: copy.id });
  });

  test("excluir some na hora, Desfazer volta; sem desfazer apaga depois do prazo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { ana } = await seed();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderWithApp(<MyProjects go={vi.fn()} />);
      await user.click(await grid().findByRole("button", { name: "Ações de Chaveiro Ana" }));
      await user.click(screen.getByRole("menuitem", { name: "Excluir" }));
      expect(grid().queryByRole("button", { name: "Abrir Chaveiro Ana" })).toBeNull();
      await user.click(screen.getByRole("button", { name: "Desfazer" }));
      expect(grid().getByRole("button", { name: "Abrir Chaveiro Ana" })).toBeInTheDocument();
      await user.click(grid().getByRole("button", { name: "Ações de Chaveiro Ana" }));
      await user.click(screen.getByRole("menuitem", { name: "Excluir" }));
      await act(async () => vi.advanceTimersByTime(UNDO_MS + 100));
      await waitFor(async () => expect(await toolProjects.get(t.db, ana)).toBeNull());
    } finally {
      vi.useRealTimers();
    }
  });

  test("vazio: explica e leva para Criar", async () => {
    const go = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<MyProjects go={go} />);
    await user.click(await screen.findByRole("button", { name: "Criar algo" }));
    expect(go).toHaveBeenCalledWith("create");
  });
});
