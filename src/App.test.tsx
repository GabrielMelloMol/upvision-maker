// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import App from "./App";
import { PAGES } from "./pages";
import { renderWithApp, setupTauri } from "./test/harness";

// Sem WebGL nem MediaPipe no happy-dom (as ferramentas abrem com prévia 3D / recorte de foto).
vi.mock("./ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
vi.mock("./vectorize/segment", () => ({ segmentSubject: vi.fn() }));

const t = setupTauri();
const UPDATE = { rid: 7, currentVersion: "0.3.0", version: "0.4.0", date: "", body: "", rawJson: {} };
const seenIntro = () => t.db.execute("INSERT INTO secrets (key, value) VALUES ('onboarding_done', '1')");
const nav = () => screen.getByRole("navigation", { name: "Navegação principal" });
const fail = (msg: string) => () => {
  throw new Error(msg);
};

describe("App", () => {
  test("primeira abertura mostra a apresentação; 'Agora não' fecha e registra", async () => {
    const user = userEvent.setup();
    renderWithApp(<App />);
    expect(await screen.findByRole("dialog", { name: "Boas-vindas ao UpVision Maker" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(async () => expect(await t.db.select("SELECT key FROM secrets WHERE key = 'onboarding_done'")).toHaveLength(1));
  });

  test("abre no Início e navega pela barra lateral até uma página carregada sob demanda", async () => {
    await seenIntro();
    const user = userEvent.setup();
    renderWithApp(<App />);
    expect(screen.getByRole("heading", { name: "O que vamos criar hoje?" })).toBeInTheDocument();
    await user.click(within(nav()).getByRole("button", { name: "Preferências" }));
    expect(await screen.findByRole("heading", { name: "Preferências", level: 1 })).toBeInTheDocument();
    expect(within(nav()).getByRole("button", { name: "Preferências" })).toHaveAttribute("aria-current", "page");
    await user.click(within(nav()).getByRole("button", { name: /UpVision Maker/ }));
    expect(screen.getByRole("heading", { name: "O que vamos criar hoje?" })).toBeInTheDocument();
  });

  test("toda página do menu abre (chunk carregado, sem ficar no skeleton)", async () => {
    await seenIntro();
    const user = userEvent.setup();
    renderWithApp(<App />);
    for (const p of PAGES.slice(1)) {
      await user.click(within(nav()).getByRole("button", { name: p.label }));
      await waitFor(() => expect(screen.queryByLabelText("Carregando")).not.toBeInTheDocument(), { timeout: 5000 });
      expect(within(nav()).getByRole("button", { name: p.label })).toHaveAttribute("aria-current", "page");
      await waitFor(() => expect(document.querySelector(".view h1")?.textContent, p.id).toBeTruthy());
    }
  }, 30_000);

  test("rolar a página mostra o título pequeno na toolbar", async () => {
    await seenIntro();
    const { container } = renderWithApp(<App />);
    const main = container.querySelector("main")!;
    main.scrollTop = 100;
    fireEvent.scroll(main);
    expect(container.querySelector(".toolbar")).toHaveClass("scrolled");
    main.scrollTop = 0;
    fireEvent.scroll(main);
    expect(container.querySelector(".toolbar")).not.toHaveClass("scrolled");
  });

  test("Ctrl+K abre a busca; escolher um registro abre a página já em edição", async () => {
    await seenIntro();
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Bambu A1', 95)");
    const user = userEvent.setup();
    renderWithApp(<App />);
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "bambu");
    await user.click(await screen.findByRole("option", { name: /Bambu A1/ }));
    expect(screen.queryByRole("dialog", { name: "Buscar" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Editar impressora" })).toBeInTheDocument();
  });

  test("botão Buscar abre a busca e escolher uma tela navega", async () => {
    await seenIntro();
    const user = userEvent.setup();
    renderWithApp(<App />);
    await user.click(screen.getByRole("button", { name: /^Buscar(?! modelos)/ })); // não o "Buscar modelos" da barra lateral
    await user.type(screen.getByRole("combobox"), "calculadora{Enter}");
    expect(await screen.findByRole("heading", { name: "Calculadora de preço" })).toBeInTheDocument();
  });

  test("fazer backup: sucesso avisa o caminho, cancelar não avisa, erro avisa", async () => {
    await seenIntro();
    const user = userEvent.setup();
    renderWithApp(<App />);
    await user.click(screen.getByRole("button", { name: "Fazer backup" }));
    expect(await screen.findByText(/^Backup salvo em \/saida\/upvision-backup-/)).toBeInTheDocument();

    t.savePath = () => null;
    const before = t.files.size;
    await user.click(screen.getByRole("button", { name: "Fazer backup" }));
    expect(t.files.size).toBe(before);

    t.handlers["plugin:dialog|save"] = fail("sem permissão");
    await user.click(screen.getByRole("button", { name: "Fazer backup" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível salvar o backup: sem permissão");
  });

  test("restaurar backup: recarrega a página e avisa a cópia de segurança; arquivo ruim avisa erro", async () => {
    await seenIntro();
    await t.db.execute("INSERT INTO printers (name, watts) VALUES ('Antiga', 100)");
    const user = userEvent.setup();
    renderWithApp(<App />);
    await user.click(screen.getByRole("button", { name: "Fazer backup" }));
    await waitFor(() => expect(t.files.size).toBe(1));
    t.openPath = [...t.files.keys()][0];
    await user.click(screen.getByRole("button", { name: "Restaurar backup" }));
    expect(await screen.findByText(/^Backup restaurado\. Cópia dos dados anteriores: \/dados-app\/backups\//)).toBeInTheDocument();

    t.files.set("/ruim.json", new TextEncoder().encode("não é json"));
    t.openPath = "/ruim.json";
    await user.click(screen.getByRole("button", { name: "Restaurar backup" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível restaurar: Este arquivo não é um backup do UpVision Maker.");
  });

  test("restaurar cancelado não faz nada", async () => {
    await seenIntro();
    const user = userEvent.setup();
    renderWithApp(<App />);
    await user.click(screen.getByRole("button", { name: "Restaurar backup" }));
    await waitFor(() => expect(t.calls).toContain("plugin:dialog|open"));
    expect(screen.queryByText(/Backup restaurado/)).not.toBeInTheDocument();
  });

  test("atualização disponível: banner instala; falha volta o botão e avisa", async () => {
    await seenIntro();
    t.handlers["plugin:updater|check"] = () => UPDATE;
    t.handlers["plugin:updater|download_and_install"] = fail("sem espaço");
    const user = userEvent.setup();
    renderWithApp(<App />);
    expect(await screen.findByText("Nova versão v0.4.0 disponível.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Atualizar e reiniciar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao atualizar: sem espaço");
    expect(screen.getByRole("button", { name: "Atualizar e reiniciar" })).toBeEnabled();
  });

  test("atualização instalando mostra 'Atualizando…' e reinicia", async () => {
    await seenIntro();
    t.handlers["plugin:updater|check"] = () => UPDATE;
    t.handlers["plugin:updater|download_and_install"] = () => null;
    t.handlers["plugin:process|restart"] = () => null;
    const user = userEvent.setup();
    renderWithApp(<App />);
    await user.click(await screen.findByRole("button", { name: "Atualizar e reiniciar" }));
    expect(screen.getByRole("button", { name: "Atualizando…" })).toBeDisabled();
    await waitFor(() => expect(t.calls).toContain("plugin:process|restart"));
  });

  test("depois de atualizar mostra as novidades (e não a apresentação); o menu mostra todas", async () => {
    await t.db.execute("INSERT INTO secrets (key, value) VALUES ('last_seen_version', '0.1.0')");
    const user = userEvent.setup();
    renderWithApp(<App />);
    expect(await screen.findByRole("dialog", { name: "O que há de novo" })).toHaveTextContent("Versão 0.2.0");
    expect(screen.queryByRole("dialog", { name: /Boas-vindas/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Entendi" }));

    await user.click(await screen.findByRole("button", { name: "Agora não" }));
    await user.click(screen.getByRole("button", { name: "O que há de novo" }));
    const all = screen.getByRole("dialog", { name: "O que há de novo" });
    expect(all).toHaveTextContent("Versão 0.1.0");
    await user.click(within(all).getByRole("button", { name: "Entendi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("'Sugerir ferramenta' abre e fecha o formulário", async () => {
    await seenIntro();
    const user = userEvent.setup();
    renderWithApp(<App />);
    await user.click(screen.getByRole("button", { name: "Sugerir ferramenta" }));
    expect(screen.getByRole("dialog", { name: "Sugerir ferramenta" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
