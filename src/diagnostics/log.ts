import { invoke } from "@tauri-apps/api/core";

/**
 * Registro de erros para suporte (#7). Tudo passa por `sanitize` antes de gravar: sem e-mail, telefone,
 * CPF/CNPJ, chave de API, ids/chaves aleatórias nem nome de usuário em caminhos. A gravação e a rotação ficam no Rust (diagnostics.rs).
 */

const RULES: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]+/g, "<chave-api>"],
  [/[^\s@<>()]+@[^\s@<>()]+\.[A-Za-z]{2,}/g, "<e-mail>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>"],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b|\b\d{11}\b/g, "<documento>"],
  [/\+\d{12,13}\b|\(\d{2}\)\s?\d{4,5}-?\d{4}/g, "<telefone>"],
  [/([A-Za-z]:\\Users\\)[^\\]+/g, "$1<usuário>"],
  [/(\/(?:Users|home)\/)[^/\s]+/g, "$1<usuário>"],
];

export function sanitize(text: string): string {
  return RULES.reduce((t, [re, to]) => t.replace(re, to), text);
}

export type Level = "error" | "warn" | "info";

export function formatLine(level: Level, source: string, message: string): string {
  return `${new Date().toISOString()} [${level}] ${source}: ${sanitize(message).replace(/\s*\r?\n\s*/g, " ")}`;
}

/** Últimas `n` linhas não vazias (vai no corpo do e-mail de diagnóstico). */
export function tail(text: string, n: number): string {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(-n)
    .join("\n");
}

const describe = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}${e.stack ? ` | ${e.stack.split("\n").slice(1, 4).join(" ").trim()}` : ""}` : String(e));

/** Grava no registro local. Nunca lança (o registro não pode virar outro erro). */
export function logError(source: string, e: unknown, level: Level = "error"): void {
  void invoke("log_append", { line: formatLine(level, source, describe(e)) }).catch(() => {});
}

export const readLog = () => invoke<string>("log_read");

let installed = false;
/** Erros não tratados do front (exceções e promessas rejeitadas) vão para o registro. */
export function installErrorLogging(target: Window = window): void {
  if (installed) return;
  installed = true;
  target.addEventListener("error", (ev) => logError("janela", ev.error ?? ev.message));
  target.addEventListener("unhandledrejection", (ev) => logError("promessa", ev.reason));
}
