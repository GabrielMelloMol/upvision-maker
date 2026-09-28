/**
 * Harness para testes de componente (Testing Library + happy-dom).
 * Mock do IPC do Tauri com o mesmo contrato do E2E (tests/e2e/tauri.ts): SQL num SQLite em memória
 * com as migrações reais, diálogos controláveis e arquivos "salvos" num Map.
 *
 * Uso (arquivo precisa começar com `// @vitest-environment happy-dom`):
 *   const t = setupTauri();                       // no topo do describe/arquivo
 *   renderWithApp(<Filaments />);               // já com ToastProvider
 *   t.db.select("SELECT * FROM filaments")      // conferir o banco
 */
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, type RenderOptions } from "@testing-library/react";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { ReactElement } from "react";
import { beforeEach } from "vitest";
import { migrate } from "../db/migrations";
import type { Db } from "../db/types";
import { ToastProvider } from "../ui/Toast";

export type TauriState = {
  /** Banco atual (novo a cada teste, já migrado). */
  raw: DatabaseSync;
  db: Db;
  /** Caminho → conteúdo gravado pelo app. */
  files: Map<string, Uint8Array>;
  /** Resposta do "Salvar como" (null = cancelou). Padrão: /saida/<nome sugerido>. */
  savePath: ((suggested: string) => string | null) | null;
  /** Resposta do "Abrir". */
  openPath: string | null;
  /** Resposta de ask()/confirm(). */
  askAnswer: boolean;
  /** Resposta de window_style. */
  windowStyle: { effect: "mica" | "sidebar" | "none"; overlayTitlebar: boolean };
  /** Comandos chamados, em ordem. */
  calls: string[];
  /** Respostas extras por comando (ex.: comandos Rust novos). */
  handlers: Record<string, (args: Record<string, unknown>) => unknown>;
};

const wrap = (raw: DatabaseSync): Db => ({
  select: async <T,>(sql: string, p: unknown[] = []) => raw.prepare(sql).all(...(p as SQLInputValue[])) as T[],
  execute: async (sql: string, p: unknown[] = []) => {
    const r = raw.prepare(sql).run(...(p as SQLInputValue[]));
    return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
  },
});

function handle(t: TauriState, cmd: string, a: unknown, headers?: Record<string, string>): unknown {
  t.calls.push(cmd);
  const args = (a ?? {}) as Record<string, unknown>;
  if (t.handlers[cmd]) return t.handlers[cmd](args);
  const params = (args.values as SQLInputValue[] | undefined) ?? [];
  switch (cmd) {
    case "plugin:sql|load":
      return args.db;
    case "plugin:sql|select":
      return t.raw.prepare(String(args.query)).all(...params);
    case "plugin:sql|execute": {
      const r = t.raw.prepare(String(args.query)).run(...params);
      return [Number(r.changes), Number(r.lastInsertRowid)];
    }
    case "plugin:dialog|save": {
      const name = ((args.options ?? {}) as { defaultPath?: string }).defaultPath ?? "arquivo";
      return t.savePath ? t.savePath(name) : `/saida/${name}`;
    }
    case "plugin:dialog|open":
      return t.openPath;
    case "plugin:dialog|message": {
      const custom = (args.buttons as { OkCancelCustom?: [string, string] } | undefined)?.OkCancelCustom;
      return custom ? custom[t.askAnswer ? 0 : 1] : t.askAnswer ? "Yes" : "No";
    }
    case "plugin:fs|write_file":
    case "plugin:fs|write_text_file":
      t.files.set(decodeURIComponent(headers?.path ?? ""), a instanceof Uint8Array ? a : new Uint8Array(a as ArrayBuffer));
      return null;
    case "plugin:fs|read_text_file": {
      const f = t.files.get(String(args.path));
      if (!f) throw new Error(`arquivo não existe: ${args.path}`);
      return [...f];
    }
    case "plugin:fs|mkdir":
      return null;
    case "plugin:path|resolve_directory":
      return "/dados-app";
    case "plugin:path|join":
      return (args.paths as string[]).join("/");
    case "plugin:app|version":
      return "0.3.0";
    case "plugin:updater|check":
      return null;
    case "plugin:opener|open_url":
      return null;
    case "window_style":
      return t.windowStyle;
    default:
      throw new Error(`comando Tauri sem mock: ${cmd}`);
  }
}

/** Instala o mock do Tauri e um banco novo antes de cada teste do arquivo. */
export function setupTauri(): TauriState {
  const t = { files: new Map(), savePath: null, openPath: null, askAnswer: true, calls: [], handlers: {}, windowStyle: { effect: "none", overlayTitlebar: false } } as unknown as TauriState;
  beforeEach(async () => {
    t.raw = new DatabaseSync(":memory:");
    t.db = wrap(t.raw);
    await migrate(t.db);
    t.files.clear();
    t.calls.length = 0;
    t.savePath = null;
    t.openPath = null;
    t.askAnswer = true;
    t.handlers = {};
    mockIPC((cmd, args) => handle(t, cmd, args));
    // mockIPC descarta os headers (o writeFile manda o caminho neles): repassa as opções também.
    const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: unknown, o?: { headers?: Record<string, string> }) => Promise<unknown> } }).__TAURI_INTERNALS__;
    internals.invoke = async (c, a, o) => handle(t, c, a, o?.headers);
  });
  return t;
}

/** render() já dentro do ToastProvider (os componentes usam useToast). */
export const renderWithApp = (ui: ReactElement, options?: RenderOptions) => render(<ToastProvider>{ui}</ToastProvider>, options);
