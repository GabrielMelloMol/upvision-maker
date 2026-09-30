import { describe, expect, test, vi } from "vitest";
import { handle, type Env, type Kv } from "./handler";

/** KV em memória (o Cloudflare KV guarda texto com validade). */
function memoryKv(): Kv {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) };
}

const env = (over: Partial<Env> = {}): Env => ({
  APP_TOKEN: "tok",
  RATE: memoryKv(),
  RESEND_API_KEY: "re_x",
  FEEDBACK_TO: "gabriel@exemplo.com",
  FEEDBACK_FROM: "UpVision <sugestoes@exemplo.com>",
  GITHUB_TOKEN: "gh_x",
  GITHUB_REPO: "gabriel/upvision-suporte",
  ...over,
});

const body = { kind: "Sugestão", title: "Etiqueta com QR", description: "Com preço", appVersion: "0.8.0", platform: "Windows", installId: "3f1c2a9e-1111-4222-8333-444455556666" };
const req = (b: unknown = body, headers: Record<string, string> = { "X-App-Token": "tok" }, method = "POST") =>
  new Request("https://upv.exemplo.workers.dev/feedback", { method, headers: { "Content-Type": "application/json", "CF-Connecting-IP": "200.1.2.3", ...headers }, body: method === "POST" ? JSON.stringify(b) : undefined });
const okFetch = () => vi.fn(async () => new Response("{}", { status: 200 }));

describe("worker de sugestões (#83)", () => {
  test("CORS: o app (tauri://localhost) pode chamar; OPTIONS responde sem corpo", async () => {
    const r = await handle(req(undefined, {}, "OPTIONS"), env(), okFetch());
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Headers")).toMatch(/X-App-Token/);
  });

  test("token errado: 401 e nada é enviado", async () => {
    const f = okFetch();
    expect((await handle(req(body, { "X-App-Token": "outro" }), env(), f)).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  test("valida os campos: título vazio, tipo estranho e imagem que não é imagem viram 400", async () => {
    for (const bad of [{ ...body, title: " " }, { ...body, kind: "Spam" }, { ...body, image: { name: "x.exe", type: "application/x-msdownload", base64: "TVo=" } }]) {
      expect((await handle(req(bad), env(), okFetch())).status).toBe(400);
    }
  });

  test("entrega por e-mail (Resend, com a imagem anexada) e issue privada no GitHub; responde com recibo", async () => {
    const f = okFetch();
    const r = await handle(req({ ...body, image: { name: "ideia.png", type: "image/png", base64: "iVBORw0KGgo=" }, diagnostics: "linha" }), env(), f);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, id: expect.any(String) });
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    const email = calls.find(([u]) => u.includes("resend"))!;
    const mail = JSON.parse(String(email[1].body));
    expect(mail).toMatchObject({ to: ["gabriel@exemplo.com"], subject: "[UpVision Maker] Sugestão: Etiqueta com QR", attachments: [{ filename: "ideia.png", content: "iVBORw0KGgo=" }] });
    expect(mail.text).toContain("Versão 0.8.0 · Windows");
    const issue = calls.find(([u]) => u.includes("api.github.com/repos/gabriel/upvision-suporte/issues"))!;
    expect(JSON.parse(String(issue[1].body))).toMatchObject({ title: "Sugestão: Etiqueta com QR", labels: ["sugestão"] });
  });

  test("limite por instalação: a 6ª mensagem na mesma hora recebe 429", async () => {
    const e = env();
    for (let i = 0; i < 5; i++) expect((await handle(req(), e, okFetch(), 1_000_000)).status).toBe(200);
    expect((await handle(req(), e, okFetch(), 1_000_000)).status).toBe(429);
    expect((await handle(req(), e, okFetch(), 1_000_000 + 3_600_000)).status).toBe(200); // hora seguinte
  });

  test("nenhuma entrega configurada: 503; entrega que falha em todos os destinos: 502", async () => {
    expect((await handle(req(), env({ RESEND_API_KEY: undefined, GITHUB_TOKEN: undefined }), okFetch())).status).toBe(503);
    expect((await handle(req(), env(), vi.fn(async () => new Response("", { status: 500 })))).status).toBe(502);
  });

  test("outras rotas e métodos: 404 / 405", async () => {
    expect((await handle(new Request("https://x.workers.dev/"), env(), okFetch())).status).toBe(404);
    expect((await handle(new Request("https://x.workers.dev/feedback"), env(), okFetch())).status).toBe(405);
  });
});
