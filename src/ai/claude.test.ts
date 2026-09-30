import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { aiErrorText, ask, countInputTokens, SYSTEM_PROMPT, testKey } from "./claude";

// Nunca chama a rede: o cliente real é trocado por uma subclasse com messages/models falsos (as classes de erro continuam as reais).
const sdk = vi.hoisted(() => ({ options: [] as unknown[], stream: vi.fn(), retrieve: vi.fn(), countTokens: vi.fn() }));
vi.mock("@anthropic-ai/sdk", async (orig) => {
  const mod = await orig<typeof import("@anthropic-ai/sdk")>();
  class Fake extends mod.default {
    constructor(o: ConstructorParameters<typeof mod.default>[0]) {
      super(o);
      sdk.options.push(o);
      Object.assign(this, { messages: { stream: sdk.stream, countTokens: sdk.countTokens }, models: { retrieve: sdk.retrieve } });
    }
  }
  return { ...mod, default: Fake };
});

const USAGE = { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
function fakeStream(deltas: string[], message: Partial<Anthropic.Message>) {
  const handlers: ((d: string) => void)[] = [];
  return {
    on: (ev: string, h: (d: string) => void) => ev === "text" && handlers.push(h),
    finalMessage: async () => {
      deltas.forEach((d) => handlers.forEach((h) => h(d)));
      return { stop_reason: "end_turn", usage: USAGE, content: [], ...message } as Anthropic.Message;
    },
  };
}
const signal = new AbortController().signal;

beforeEach(() => {
  sdk.options.length = 0;
  sdk.stream.mockReset();
  sdk.retrieve.mockReset();
});

describe("ask", () => {
  test("manda prompt de sistema em cache, conta caracteres do streaming, junta os blocos de texto e estima o custo", async () => {
    sdk.stream.mockReturnValue(
      fakeStream(["Oi", " tudo"], {
        content: [
          { type: "text", text: "parte 1", citations: null },
          { type: "thinking", thinking: "...", signature: "" },
          { type: "text", text: "parte 2", citations: null },
        ] as Anthropic.ContentBlock[],
      }),
    );
    const onText = vi.fn();
    const history: Anthropic.MessageParam[] = [{ role: "user", content: "cubo" }];
    const r = await ask("sk-ant-x", "claude-sonnet-5", history, onText, signal);

    expect(r.text).toBe("parte 1\nparte 2");
    expect(r.costUsd).toBeCloseTo(2, 6); // 1M tokens de entrada × US$ 2
    expect(onText.mock.calls).toEqual([[2], [7]]);
    const [params, opts] = sdk.stream.mock.calls[0];
    expect(params).toMatchObject({ model: "claude-sonnet-5", messages: history, system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }] });
    // o fim da conversa também vai em cache: imagens e voltas anteriores não pagam inteiras de novo (#89)
    expect(params.cache_control).toEqual({ type: "ephemeral" });
    expect(opts).toEqual({ signal });
    expect(sdk.options[0]).toMatchObject({ apiKey: "sk-ant-x", dangerouslyAllowBrowser: true, maxRetries: 2 });
  });

  test("recusa e resposta cortada viram erros explicados", async () => {
    sdk.stream.mockReturnValueOnce(fakeStream([], { stop_reason: "refusal" }));
    await expect(ask("k", "claude-sonnet-5", [], () => {}, signal)).rejects.toThrow(/recusou este pedido/);
    sdk.stream.mockReturnValueOnce(fakeStream([], { stop_reason: "max_tokens" }));
    await expect(ask("k", "claude-sonnet-5", [], () => {}, signal)).rejects.toThrow(/grande demais e foi cortada/);
  });
});

test("countInputTokens conta pela API o pedido com o prompt de sistema e as imagens (#89)", async () => {
  sdk.countTokens.mockResolvedValue({ input_tokens: 2345 });
  const history: Anthropic.MessageParam[] = [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }, { type: "text", text: "igual" }] }];
  await expect(countInputTokens("sk-ant-x", "claude-sonnet-5", history)).resolves.toBe(2345);
  expect(sdk.countTokens).toHaveBeenCalledWith({ model: "claude-sonnet-5", system: SYSTEM_PROMPT, messages: history });
});

test("o prompt de sistema orienta sobre imagens: só referência, pedir medida sem escala, nada de marcas de terceiros (#89)", () => {
  expect(SYSTEM_PROMPT).toMatch(/só como referência de forma/);
  expect(SYSTEM_PROMPT).toMatch(/não tem escala/);
  expect(SYSTEM_PROMPT).toMatch(/Nunca reproduza logotipos, marcas/);
});

test("testKey devolve o nome do modelo", async () => {
  sdk.retrieve.mockResolvedValue({ display_name: "Claude Sonnet 5" });
  await expect(testKey("sk-ant-x", "claude-sonnet-5")).resolves.toBe("Claude Sonnet 5");
  expect(sdk.retrieve).toHaveBeenCalledWith("claude-sonnet-5");
});

describe("aiErrorText", () => {
  const api = (status: number) => Anthropic.APIError.generate(status, { error: { message: "detalhe" } }, "detalhe", new Headers());
  test.each([
    [401, "Chave da API inválida. Confira em Preferências."],
    [403, "Esta chave não tem permissão para usar o modelo escolhido."],
    [404, "Modelo não encontrado. Escolha outro em Preferências."],
    [429, "Muitos pedidos seguidos. Espere um minuto e tente de novo."],
  ])("HTTP %i", (status, text) => expect(aiErrorText(api(status))).toBe(text));

  test("400 cita o motivo e o saldo; 500 mostra o status; sem conexão; erros comuns", () => {
    expect(aiErrorText(api(400))).toMatch(/^A API recusou o pedido: .*detalhe.*console\.anthropic\.com/);
    expect(aiErrorText(api(500))).toMatch(/^Erro da API \(500\): /);
    expect(aiErrorText(new Anthropic.APIConnectionError({ message: "x" }))).toBe("Sem conexão com a Anthropic. Verifique a internet.");
    expect(aiErrorText(new Error("falhou"))).toBe("falhou");
    expect(aiErrorText("texto")).toBe("texto");
  });
});
