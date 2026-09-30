// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { feedbackChannels, feedbackText, installationId, MAX_DESCRIPTION, rememberSent, sendFeedback, sentHistory, whatsappUrl, type Feedback } from "./feedback";

const base: Feedback = { kind: "Sugestão", title: "Gerador de etiqueta", description: "Queria etiqueta com QR & preço", appVersion: "0.8.0", platform: "Windows" };

beforeEach(() => localStorage.clear());

describe("canais de envio (#83)", () => {
  test("endpoint só https; WhatsApp só com DDI+DDD+número; o resto vira null", () => {
    expect(feedbackChannels({ VITE_FEEDBACK_URL: "https://upv.gabriel.workers.dev/feedback", VITE_FEEDBACK_WHATSAPP: "+55 (21) 99999-0000" })).toEqual({
      endpoint: "https://upv.gabriel.workers.dev/feedback",
      whatsapp: "5521999990000",
    });
    expect(feedbackChannels({ VITE_FEEDBACK_URL: "http://inseguro.com", VITE_FEEDBACK_WHATSAPP: "123" })).toEqual({ endpoint: null, whatsapp: null });
    expect(feedbackChannels({})).toEqual({ endpoint: null, whatsapp: null });
  });

  test("texto para copiar/WhatsApp: tipo, título, descrição cortada, versão e sistema", () => {
    const t = feedbackText({ ...base, description: "x".repeat(MAX_DESCRIPTION + 100), diagnostics: "linha de log" });
    expect(t.startsWith("[UpVision Maker] Sugestão: Gerador de etiqueta")).toBe(true);
    expect(t.match(/x/g)!.length).toBe(MAX_DESCRIPTION);
    expect(t).toContain("Versão 0.8.0 · Windows");
    expect(t).toContain("linha de log");
  });

  test("link do WhatsApp com o texto pronto; imagem vira lembrete para mandar na conversa", () => {
    const u = new URL(whatsappUrl({ ...base, image: { name: "ideia.png", type: "image/png", base64: "AAAA" } }, "5521999990000"));
    expect(u.origin + u.pathname).toBe("https://wa.me/5521999990000");
    expect(u.searchParams.get("text")).toContain("QR & preço");
    expect(u.searchParams.get("text")).toContain("mande a imagem ideia.png");
  });
});

describe("envio pelo app (#83)", () => {
  const ok = () => vi.fn(async () => new Response(JSON.stringify({ ok: true, id: "abc" }), { status: 200 }));

  test("POST com o token do app e a instalação; devolve o recibo", async () => {
    const fetchFn = ok();
    const r = await sendFeedback(base, { endpoint: "https://x.workers.dev/feedback", token: "tok" }, fetchFn);
    expect(r).toEqual({ id: "abc" });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.workers.dev/feedback");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-App-Token"]).toBe("tok");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ kind: "Sugestão", title: "Gerador de etiqueta", installId: installationId() });
  });

  test("erros com mensagem para a usuária: muitas seguidas, servidor e sem internet", async () => {
    const endpoint = { endpoint: "https://x.workers.dev/feedback", token: "" };
    await expect(sendFeedback(base, endpoint, vi.fn(async () => new Response("", { status: 429 })))).rejects.toThrow(/muitas mensagens/i);
    await expect(sendFeedback(base, endpoint, vi.fn(async () => new Response("", { status: 500 })))).rejects.toThrow(/não recebeu/i);
    await expect(sendFeedback(base, endpoint, vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))))).rejects.toThrow(/internet/i);
  });

  test("instalação com id fixo; histórico das enviadas (mais recente primeiro, até 20)", () => {
    expect(installationId()).toBe(installationId());
    for (let i = 0; i < 22; i++) rememberSent({ title: `Ideia ${i}`, kind: "Sugestão", via: "app", at: `2026-10-${String((i % 28) + 1).padStart(2, "0")}` });
    const h = sentHistory();
    expect(h).toHaveLength(20);
    expect(h[0].title).toBe("Ideia 21");
  });
});
