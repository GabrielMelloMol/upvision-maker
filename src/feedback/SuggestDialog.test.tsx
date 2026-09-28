// @vitest-environment happy-dom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderWithApp, setupTauri } from "../test/harness";
import SuggestDialog from "./SuggestDialog";

const t = setupTauri();

describe("SuggestDialog", () => {
  test("sem título não abre nada e pede um título", async () => {
    const user = userEvent.setup();
    renderWithApp(<SuggestDialog onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Abrir no GitHub/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Dê um título curto para a ideia.");
    expect(t.calls).not.toContain("plugin:opener|open_url");
  });

  test("abre a issue com título, descrição, versão e lembrete da imagem", async () => {
    let url = "";
    t.handlers["plugin:opener|open_url"] = (a) => {
      url = String(a.url);
      return null;
    };
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<SuggestDialog onClose={onClose} />);
    await user.type(screen.getByLabelText(/O que você queria/), "Etiqueta com QR");
    await user.type(screen.getByLabelText(/Conte mais/), "Para a feira");
    await user.upload(screen.getByLabelText(/Imagem de exemplo/), new File(["x"], "ideia.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: /Abrir no GitHub/ }));

    expect(await screen.findByText(/Abrimos o GitHub com a sugestão pronta/)).toHaveTextContent("Não esqueça de anexar a imagem ideia.png.");
    const u = new URL(url);
    expect(u.searchParams.get("title")).toBe("Sugestão: Etiqueta com QR");
    expect(u.searchParams.get("body")).toContain("Para a feira");
    expect(u.searchParams.get("body")).toContain("Versão: 0.3.0");
    const [, footerClose] = screen.getAllByRole("button", { name: "Fechar" }); // X do cabeçalho + botão do rodapé
    await user.click(footerClose);
    expect(onClose).toHaveBeenCalled();
  });

  test("versão indisponível vira 'dev'; falha ao abrir o navegador mostra o erro", async () => {
    t.handlers["plugin:app|version"] = () => {
      throw new Error("x");
    };
    t.handlers["plugin:opener|open_url"] = (a) => {
      if (String(a.url).includes("dev")) throw new Error("sem navegador");
      return null;
    };
    const user = userEvent.setup();
    renderWithApp(<SuggestDialog onClose={() => {}} />);
    await user.type(screen.getByLabelText(/O que você queria/), "Ideia");
    await user.click(screen.getByRole("button", { name: /Abrir no GitHub/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não consegui abrir o e-mail/navegador: sem navegador");
  });

  test("Cancelar fecha", async () => {
    const onClose = vi.fn();
    renderWithApp(<SuggestDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
