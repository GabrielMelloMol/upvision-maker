import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { cspWithFeedback } from "./cspHost";

const BASE = "default-src 'self'; connect-src 'self' https://api.anthropic.com data:; img-src 'self'";

describe("CSP do app: só o host do Worker de sugestões (B28)", () => {
  test("o tauri.conf.json do repositório não libera nenhum *.workers.dev: o host entra só no build de lançamento", () => {
    const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as { app: { security: { csp: string } } };
    expect(conf.app.security.csp).not.toContain("workers.dev");
    expect(conf.app.security.csp).not.toMatch(/connect-src[^;]*\*/);
  });

  test("com a URL do Worker, o connect-src ganha exatamente aquele endereço", () => {
    const csp = cspWithFeedback(BASE, "https://upv.exemplo.workers.dev/feedback");
    expect(csp).toContain("connect-src 'self' https://api.anthropic.com data: https://upv.exemplo.workers.dev;");
    expect(csp).not.toContain("*");
  });

  test("tira qualquer *.workers.dev genérico que tenha sobrado", () => {
    const csp = cspWithFeedback(BASE.replace("data:", "https://*.workers.dev data:"), "https://upv.exemplo.workers.dev");
    expect(csp).not.toContain("*.workers.dev");
    expect(csp).toContain("https://upv.exemplo.workers.dev");
  });

  test("sem URL, URL inválida ou http: não libera nada e é idempotente", () => {
    expect(cspWithFeedback(BASE, "")).toBe(BASE);
    expect(cspWithFeedback(BASE, "não é url")).toBe(BASE);
    expect(cspWithFeedback(BASE, "http://upv.exemplo.workers.dev")).toBe(BASE);
    const once = cspWithFeedback(BASE, "https://a.b.workers.dev/x");
    expect(cspWithFeedback(once, "https://a.b.workers.dev/x")).toBe(once);
  });
});
