// @vitest-environment happy-dom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { logError } from "../diagnostics/log";
import { renderWithApp, setupTauri } from "../test/harness";
import { sentHistory } from "./feedback";
import SuggestDialog from "./SuggestDialog";

const t = setupTauri();
const ALL = { endpoint: "https://upv.exemplo.workers.dev/feedback", whatsapp: "5521999990000" };
const NONE = { endpoint: null, whatsapp: null };

let posts: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[];
beforeEach(() => {
  localStorage.clear();
  posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      posts.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ ok: true, id: "r1" }), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const opened = () => {
  const urls: string[] = [];
  t.handlers["plugin:opener|open_url"] = (a) => void urls.push(String(a.url));
  return urls;
};

describe("Sugerir ferramenta (#83)", () => {
  test("sem título e sem diagnóstico não envia e pede um título", async () => {
    const user = userEvent.setup();
    renderWithApp(<SuggestDialog onClose={() => {}} channels={ALL} token="tok" />);
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText(/Dê um título curto/)).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  test("com o endpoint: envia pelo app com imagem e token, mostra 'Recebido ✓' e guarda no histórico", async () => {
    const user = userEvent.setup();
    renderWithApp(<SuggestDialog onClose={() => {}} channels={ALL} token="tok" />);
    expect(screen.queryByRole("button", { name: /GitHub|e-mail/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("O que você queria que o app fizesse?"), "Etiqueta com QR");
    await user.type(screen.getByLabelText(/Conte mais/), "Com preço");
    await user.upload(screen.getByLabelText(/Imagem de exemplo/), new File(["png!"], "ideia.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText(/Recebido ✓/)).toBeInTheDocument();
    expect(posts[0].url).toBe(ALL.endpoint);
    expect(posts[0].headers["X-App-Token"]).toBe("tok");
    expect(posts[0].body).toMatchObject({ kind: "Sugestão", title: "Etiqueta com QR", description: "Com preço", image: { name: "ideia.png", type: "image/png", base64: btoa("png!") } });
    expect(posts[0].body.diagnostics).toBeUndefined();
    expect(sentHistory()[0]).toMatchObject({ title: "Etiqueta com QR", via: "app" });
  });

  test("diagnóstico sem título: vai como 'Algo deu errado' com os últimos erros, sem dados pessoais", async () => {
    logError("backup", new Error("C:\\Users\\Ana\\OneDrive sem permissão"));
    await waitFor(() => expect(t.log).toHaveLength(1));
    const user = userEvent.setup();
    renderWithApp(<SuggestDialog onClose={() => {}} channels={ALL} token="tok" />);
    await user.click(screen.getByRole("checkbox", { name: "Mandar junto o diagnóstico" }));
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toMatchObject({ kind: "Diagnóstico", title: "Algo deu errado" });
    expect(String(posts[0].body.diagnostics)).toContain("<usuário>");
    expect(String(posts[0].body.diagnostics)).not.toContain("Ana");
  });

  test("sem endpoint: WhatsApp vira o botão principal com o texto pronto", async () => {
    const urls = opened();
    const user = userEvent.setup();
    renderWithApp(<SuggestDialog onClose={() => {}} channels={{ ...ALL, endpoint: null }} />);
    expect(screen.queryByRole("button", { name: "Enviar" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("O que você queria que o app fizesse?"), "Molde de sabonete");
    await user.click(screen.getByRole("button", { name: "Enviar pelo WhatsApp" }));
    await waitFor(() => expect(urls).toHaveLength(1));
    const u = new URL(urls[0]);
    expect(u.pathname).toBe("/5521999990000");
    expect(u.searchParams.get("text")).toMatch(/^\[UpVision Maker\] Sugestão: Molde de sabonete/);
    expect(await screen.findByText(/Abrimos o WhatsApp/)).toBeInTheDocument();
  });

  test("sem nenhum canal: só 'Copiar texto', que copia a mensagem", async () => {
    const user = userEvent.setup(); // o user-event instala uma área de transferência de teste
    renderWithApp(<SuggestDialog onClose={() => {}} channels={NONE} />);
    await user.type(screen.getByLabelText("O que você queria que o app fizesse?"), "Chaveiro de pet");
    await user.click(screen.getByRole("button", { name: "Copiar texto" }));
    expect(await screen.findByText(/Texto copiado\. Cole/)).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toMatch(/Chaveiro de pet[\s\S]*Versão/);
  });

  test("erro do servidor aparece e dá para tentar pelo WhatsApp", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    const user = userEvent.setup();
    renderWithApp(<SuggestDialog onClose={() => {}} channels={ALL} token="tok" />);
    await user.type(screen.getByLabelText("O que você queria que o app fizesse?"), "Algo");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText(/muitas mensagens seguidas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar pelo WhatsApp" })).toBeEnabled();
  });

  test("Cancelar fecha", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithApp(<SuggestDialog onClose={onClose} channels={NONE} />);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
  });
});
