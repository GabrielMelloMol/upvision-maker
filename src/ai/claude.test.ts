import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { aiError, aiErrorText, ask, countInputTokens, SYSTEM_PROMPT, testKey } from "./claude";

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
    const r = await ask({ apiKey: "sk-ant-x" }, "claude-sonnet-5", history, onText, signal);

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
    await expect(ask({ apiKey: "k" }, "claude-sonnet-5", [], () => {}, signal)).rejects.toThrow(/recusou este pedido/);
    sdk.stream.mockReturnValueOnce(fakeStream([], { stop_reason: "max_tokens" }));
    await expect(ask({ apiKey: "k" }, "claude-sonnet-5", [], () => {}, signal)).rejects.toThrow(/grande demais e foi cortada/);
  });
});

test("countInputTokens conta pela API o pedido com o prompt de sistema e as imagens (#89)", async () => {
  sdk.countTokens.mockResolvedValue({ input_tokens: 2345 });
  const history: Anthropic.MessageParam[] = [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } }, { type: "text", text: "igual" }] }];
  await expect(countInputTokens({ apiKey: "sk-ant-x" }, "claude-sonnet-5", history)).resolves.toBe(2345);
  expect(sdk.countTokens).toHaveBeenCalledWith({ model: "claude-sonnet-5", system: SYSTEM_PROMPT, messages: history });
});

test("o prompt de sistema orienta sobre imagens: só referência, pedir medida sem escala, nada de marcas de terceiros (#89)", () => {
  expect(SYSTEM_PROMPT).toMatch(/só como referência de forma/);
  expect(SYSTEM_PROMPT).toMatch(/não tem escala/);
  expect(SYSTEM_PROMPT).toMatch(/Nunca reproduza logotipos, marcas/);
});

test("testKey devolve o nome do modelo", async () => {
  sdk.retrieve.mockResolvedValue({ display_name: "Claude Sonnet 5" });
  await expect(testKey({ apiKey: "sk-ant-x" }, "claude-sonnet-5")).resolves.toBe("Claude Sonnet 5");
  expect(sdk.retrieve).toHaveBeenCalledWith("claude-sonnet-5");
});

test("ID do workspace vai no header anthropic-workspace-id de todas as chamadas; sem ID, não vai (#157)", async () => {
  sdk.retrieve.mockResolvedValue({ display_name: "x" });
  await testKey({ apiKey: "sk-ant-x", workspaceId: "wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ" }, "m");
  sdk.countTokens.mockResolvedValue({ input_tokens: 1 });
  await countInputTokens({ apiKey: "sk-ant-x", workspaceId: "wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ" }, "m", []);
  sdk.stream.mockReturnValue(fakeStream([], {}));
  await ask({ apiKey: "sk-ant-x", workspaceId: "wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ" }, "m", [], () => {}, signal);
  await testKey({ apiKey: "sk-ant-x", workspaceId: null }, "m");
  expect(sdk.options.slice(0, 3)).toEqual(Array(3).fill(expect.objectContaining({ defaultHeaders: { "anthropic-workspace-id": "wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ" } })));
  expect(sdk.options[3]).not.toHaveProperty("defaultHeaders");
});

describe("aiError: respostas simuladas da API viram mensagens humanas, com o texto técnico à parte (#157)", () => {
  const api = (status: number, type: string, message: string, headers: Record<string, string> = {}) =>
    Anthropic.APIError.generate(status, { type: "error", error: { type, message } }, `${status} {"type":"error","error":{"type":"${type}","message":"${message}"}}`, new Headers({ "request-id": "req_1", ...headers }));

  test("chave sem workspace (o 400 da namorada do Gabriel): explica e dá os passos", () => {
    const e = api(400, "invalid_request_error", "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use.");
    const r = aiError(e);
    expect(r.text).toBe("Esta chave não está ligada a um workspace, então a Anthropic recusou o pedido.");
    expect(r.steps!.join(" ")).toMatch(/Settings → Workspaces.*API keys.*Create key.*wrkspc_/);
    expect(r.text).not.toMatch(/créditos|saldo/);
    expect(r.detail).toContain("not scoped to a workspace");
    expect(r.detail).toContain("request-id: req_1");
  });

  test.each([
    [401, "authentication_error", "invalid x-api-key", /^Chave da API inválida/],
    [403, "permission_error", "no access", /^Esta chave não tem permissão/],
    [403, "permission_error", "key cannot access this workspace", /^Esta chave não está ligada a um workspace/],
    [400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.", /^Acabaram os créditos/],
    [402, "billing_error", "payment required", /^Acabaram os créditos/],
    [400, "invalid_request_error", "messages.0.content.1.image.source.base64: image exceeds 5 MB maximum", /^Uma imagem é grande demais ou está num formato/],
    [400, "invalid_request_error", "Image does not match the provided media type image/png", /^Uma imagem é grande demais ou está num formato/],
    [413, "request_too_large", "Request exceeds the maximum allowed number of bytes.", /^Uma imagem é grande demais/],
    [404, "not_found_error", "model: x", /^Modelo não encontrado/],
    [529, "overloaded_error", "Overloaded", /sobrecarregados\. O app já tentou de novo sozinho/],
    [500, "api_error", "Internal server error", /sobrecarregados/],
    [400, "invalid_request_error", "max_tokens: too big", /^A Anthropic recusou o pedido\. Veja os detalhes/],
  ])("HTTP %i %s", (status, type, message, text) => {
    const r = aiError(api(status, type, message));
    expect(r.text).toMatch(text);
    expect(r.detail).toContain(message);
  });

  test("429 diz em quantos segundos tentar (retry-after); sem o header, 60 s", () => {
    expect(aiError(api(429, "rate_limit_error", "slow down", { "retry-after": "17" })).text).toBe("Muitos pedidos seguidos. Tente de novo em 17 s.");
    expect(aiError(api(429, "rate_limit_error", "slow down")).text).toBe("Muitos pedidos seguidos. Tente de novo em 60 s.");
  });

  test("sem internet, demora, erros comuns", () => {
    expect(aiErrorText(new Anthropic.APIConnectionError({ message: "x" }))).toBe("Sem conexão com a Anthropic. Verifique a internet e tente de novo.");
    expect(aiErrorText(new Anthropic.APIConnectionTimeoutError())).toMatch(/^A Anthropic demorou demais/);
    expect(aiError(new Error("falhou"))).toEqual({ text: "falhou" });
    expect(aiErrorText("texto")).toBe("texto");
  });
});
