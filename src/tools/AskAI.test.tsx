// @vitest-environment happy-dom
import Anthropic from "@anthropic-ai/sdk";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ask, type AskResult } from "../ai/claude";
import { RenderCancelled, renderScad } from "../ai/render";
import { setSecret } from "../db/repo";
import type { Model } from "../geometry/types";
import { renderWithApp, setupTauri } from "../test/harness";
import AskAI from "./AskAI";

vi.mock("../ui/viewerScene", () => ({ createViewer: () => ({ setModels() {}, dispose() {} }) }));
// countInputTokens (estimativa antes de enviar, #89) também é simulado: nada vai para a rede
vi.mock("../ai/claude", async (orig) => ({ ...(await orig<typeof import("../ai/claude")>()), ask: vi.fn(), countInputTokens: vi.fn(async () => 1234) }));
vi.mock("../ai/render", async (orig) => ({ ...(await orig<typeof import("../ai/render")>()), renderScad: vi.fn() }));

const t = setupTauri();
const askMock = vi.mocked(ask);
const renderMock = vi.mocked(renderScad);

const CUBE: Model = {
  name: "Peça da IA",
  parts: [{ name: "Peça", color: "#2563eb", mesh: { positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 20, 0, 0, 0, 5]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) } }],
};
const reply = (text: string, costUsd: number | null = 0.0123): AskResult => ({
  text,
  costUsd,
  message: { content: [{ type: "text", text }], usage: { input_tokens: 1000, output_tokens: 50, cache_read_input_tokens: 234, cache_creation_input_tokens: 0 } } as unknown as Anthropic.Message,
});
const WITH_CODE = "Fiz um cubo.\n```openscad\nmodule a() { cube(10); }\n```";

beforeEach(async () => {
  askMock.mockReset();
  renderMock.mockReset();
  await setSecret(t.db, "anthropic_api_key", "sk-ant-teste");
  await setSecret(t.db, "ai_model", "claude-sonnet-5");
});

async function start(text = "um cubo") {
  const user = userEvent.setup();
  const go = vi.fn();
  renderWithApp(<AskAI go={go} />);
  await screen.findByText(/Modelo: claude-sonnet-5/);
  await user.type(screen.getByRole("textbox"), text);
  return { user, go };
}

describe("Pedir à IA", () => {
  test("sem chave: explica o custo e leva a Preferências", async () => {
    await t.db.execute("DELETE FROM secrets WHERE key = 'anthropic_api_key'");
    const user = userEvent.setup();
    const go = vi.fn();
    renderWithApp(<AskAI go={go} />);
    await user.click(await screen.findByRole("button", { name: "Ir para Preferências" }));
    expect(go).toHaveBeenCalledWith("preferences");
    expect(screen.getByText(/pago por pedido/)).toBeInTheDocument();
  });

  test("pedido: mostra explicação, código, tokens e custo; renderiza e permite exportar; ajuste manda o histórico", async () => {
    askMock.mockResolvedValue(reply(WITH_CODE));
    renderMock.mockReturnValue({ result: Promise.resolve(CUBE), cancel: () => {} });
    const { user } = await start();
    await user.click(screen.getByRole("button", { name: /Criar peça/ }));

    expect(await screen.findByText("Fiz um cubo.")).toBeInTheDocument();
    expect(screen.getByText("Ver código OpenSCAD")).toBeInTheDocument();
    expect(screen.getByText("1.234 tokens de entrada · 50 de saída · ≈ US$ 0.012")).toBeInTheDocument();
    expect(await screen.findByText("10.0 × 20.0 × 5.0 mm")).toBeInTheDocument();
    expect(screen.getByText(/gasto nesta conversa ≈ US\$ 0.012/)).toBeInTheDocument();
    expect(renderMock).toHaveBeenCalledWith("module a() { cube(10); }", "Peça da IA");
    expect(askMock.mock.calls[0][0]).toBe("sk-ant-teste");
    expect(askMock.mock.calls[0][2]).toEqual([{ role: "user", content: "um cubo" }]);

    await user.click(screen.getByRole("button", { name: /Salvar 3MF/ }));
    await waitFor(() => expect(t.files.has("/saida/peca-ia.3mf")).toBe(true));

    await user.type(screen.getByRole("textbox"), "maior");
    await user.click(screen.getByRole("button", { name: /Pedir ajuste/ }));
    await waitFor(() => expect(askMock).toHaveBeenCalledTimes(2));
    expect(askMock.mock.calls[1][2].map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  test("exemplo preenche o pedido; Ctrl+Enter envia; resposta sem código não renderiza", async () => {
    askMock.mockResolvedValue(reply("Pode detalhar o tamanho?", null));
    const user = userEvent.setup();
    renderWithApp(<AskAI go={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: /Porta-copos redondo/ }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toMatch(/^Porta-copos redondo de 90 mm/);
    await user.type(screen.getByRole("textbox"), "{Control>}{Enter}{/Control}");
    expect(await screen.findByText("Pode detalhar o tamanho?")).toBeInTheDocument();
    expect(screen.getByText(/custo não estimado/)).toBeInTheDocument();
    expect(renderMock).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  test("OpenSCAD falha: pede correção sozinho até 2 vezes e depois desiste com aviso", async () => {
    askMock.mockResolvedValue(reply(WITH_CODE));
    renderMock.mockImplementation(() => ({ result: Promise.reject(new Error("syntax error line 3")), cancel: () => {} }));
    const { user } = await start();
    await user.click(screen.getByRole("button", { name: /Criar peça/ }));
    expect(await screen.findByText(/O código ainda não renderizou/)).toBeInTheDocument();
    expect(askMock).toHaveBeenCalledTimes(3);
    expect(screen.getAllByText("(correção automática do erro do OpenSCAD)")).toHaveLength(2);
    expect(screen.getAllByText("Erro no OpenSCAD: syntax error line 3")).toHaveLength(3);
    expect(askMock.mock.calls[1][2].at(-1)!.content).toContain("syntax error line 3");
  });

  test("erro da API aparece em português", async () => {
    askMock.mockRejectedValue(new Anthropic.APIConnectionError({ message: "offline" }));
    const { user } = await start();
    await user.click(screen.getByRole("button", { name: /Criar peça/ }));
    expect(await screen.findByText("Sem conexão com a Anthropic. Verifique a internet.")).toBeInTheDocument();
  });

  test("cancelar enquanto o Claude escreve: sem erro na tela", async () => {
    askMock.mockImplementation((_k, _m, _h, onText, signal) => {
      onText(42);
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError())));
    });
    const { user } = await start();
    await user.click(screen.getByRole("button", { name: /Criar peça/ }));
    expect(await screen.findByText("Claude escrevendo… 42 caracteres")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Cancelar/ }));
    await waitFor(() => expect(screen.queryByText(/Claude escrevendo/)).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("cancelar a renderização: não mostra erro nem tenta corrigir", async () => {
    askMock.mockResolvedValue(reply(WITH_CODE));
    renderMock.mockImplementation(() => {
      let cancel = () => {};
      const result = new Promise<Model>((_, reject) => (cancel = () => reject(new RenderCancelled())));
      return { result, cancel: () => cancel() };
    });
    const { user } = await start();
    await user.click(screen.getByRole("button", { name: /Criar peça/ }));
    await user.click(await screen.findByRole("button", { name: /Cancelar/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Cancelar/ })).not.toBeInTheDocument());
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Erro no OpenSCAD/)).not.toBeInTheDocument();
  });
});

describe("Virar modelo (#97)", () => {
  const PARAM = "Pronto.\n```openscad\n/* [Medidas] */\n// Lado (mm)\nlado = 10; // [5:1:50]\ncube(lado);\n```";

  test("1 pedido expõe as medidas como parâmetros, confere que renderiza, guarda em Meus modelos e abre o formulário", async () => {
    const { modelVariants } = await import("../db/modelVariantsRepo");
    const { takeScadHandoff } = await import("../scad/library");
    askMock.mockResolvedValueOnce(reply(WITH_CODE)).mockResolvedValueOnce(reply(PARAM, 0.02));
    renderMock.mockReturnValue({ result: Promise.resolve(CUBE), cancel: () => {} });
    const { user, go } = await start();
    await user.click(screen.getByRole("button", { name: /Criar peça/ }));
    await user.click(await screen.findByRole("button", { name: /Virar modelo/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("scad"));
    // pedido sem o histórico da conversa (mais barato), com o código atual
    const sent = askMock.mock.calls[1][2];
    expect(sent).toHaveLength(1);
    expect(String(sent[0].content)).toContain("module a() { cube(10); }");
    expect(renderMock).toHaveBeenLastCalledWith(expect.stringContaining("lado = 10;"), "Modelo da IA");
    const saved = await modelVariants.list(t.db, "scad");
    expect(saved).toHaveLength(1);
    expect(JSON.parse(saved[0].data)).toMatchObject({ license: "own", source: expect.stringContaining("// [5:1:50]") });
    expect(takeScadHandoff()).toMatchObject({ name: "um cubo", license: "own" });
  });

  test("resposta sem parâmetros: erro claro e nada guardado", async () => {
    askMock.mockResolvedValueOnce(reply(WITH_CODE)).mockResolvedValueOnce(reply(WITH_CODE));
    renderMock.mockReturnValue({ result: Promise.resolve(CUBE), cancel: () => {} });
    const { user, go } = await start();
    await user.click(screen.getByRole("button", { name: /Criar peça/ }));
    await user.click(await screen.findByRole("button", { name: /Virar modelo/ }));
    expect(await screen.findByText(/não devolveu parâmetros/)).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
  });
});
