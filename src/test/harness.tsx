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
import { beforeEach, vi } from "vitest";
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
  /** Linhas gravadas no registro de diagnóstico (log_append). */
  log: string[];
  /** Backups automáticos "no disco": pasta → (nome → conteúdo). Pasta "" = padrão. */
  autoBackups: Map<string, Map<string, string>>;
  /** Resposta da API pública de releases do GitHub (fetch é interceptado; nada vai para a rede). null = sem internet. */
  releases: unknown[] | null;
  /** Respostas extras por comando (ex.: comandos Rust novos). */
  handlers: Record<string, (args: Record<string, unknown>) => unknown>;
  /**
   * Escopo do plugin fs como no app instalado (auditoria A12): só grava na pasta do app, no arquivo devolvido pelo
   * "Salvar como" e dentro da pasta escolhida no "Abrir" de pasta. Desligado por padrão (os testes antigos gravam em
   * qualquer caminho).
   */
  fsScope: boolean;
  /** Caminhos liberados pelos diálogos (para o `fsScope`). */
  granted: { files: Set<string>; dirs: Set<string> };
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
      const path = t.savePath ? t.savePath(name) : `/saida/${name}`;
      if (path) t.granted.files.add(path);
      return path;
    }
    case "plugin:dialog|open": {
      const dir = ((args.options ?? {}) as { directory?: boolean }).directory;
      if (t.openPath) (dir ? t.granted.dirs : t.granted.files).add(t.openPath);
      return t.openPath;
    }
    case "plugin:dialog|message": {
      const custom = (args.buttons as { OkCancelCustom?: [string, string] } | undefined)?.OkCancelCustom;
      return custom ? custom[t.askAnswer ? 0 : 1] : t.askAnswer ? "Yes" : "No";
    }
    case "plugin:fs|write_file":
    case "plugin:fs|write_text_file": {
      const path = decodeURIComponent(headers?.path ?? "");
      const parent = path.replace(/\/[^/]*$/, "");
      if (t.fsScope && !path.startsWith("/dados-app/") && !t.granted.files.has(path) && !t.granted.dirs.has(parent)) throw new Error(`forbidden path: ${path}`);
      t.files.set(path, a instanceof Uint8Array ? a : new Uint8Array(a as ArrayBuffer));
      return null;
    }
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
    case "plugin:event|listen":
      return 1;
    case "plugin:event|unlisten":
      return null;
    case "log_append":
      t.log.push(String(args.line));
      return null;
    case "log_read":
      return t.log.length ? `${t.log.join("\n")}\n` : "";
    case "backup_default_dir":
      return "/dados-app/backups/auto";
    case "backup_write": {
      const dir = String(args.dir ?? "");
      const folder = t.autoBackups.get(dir) ?? new Map<string, string>();
      const name = `upvision-auto-${args.stamp}.json`;
      for (const k of [...folder.keys()]) if (k.startsWith(`upvision-auto-${String(args.stamp).slice(0, 10)}`)) folder.delete(k);
      folder.set(name, String(args.json));
      const autos = [...folder.keys()].filter((k) => k.startsWith("upvision-auto-"));
      const keep = autos.sort().reverse().slice(0, Number(args.keep));
      for (const k of autos) if (!keep.includes(k)) folder.delete(k);
      t.autoBackups.set(dir, folder);
      return { name, path: `${dir || "/dados-app/backups/auto"}/${name}`, bytes: String(args.json).length };
    }
    case "backup_list":
      return [...(t.autoBackups.get(String(args.dir ?? "")) ?? new Map()).entries()]
        .filter(([name]) => /^upvision-(auto|conflito)-/.test(name))
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([name, json]) => ({ name, path: `${args.dir || "/dados-app/backups/auto"}/${name}`, bytes: json.length }));
    case "sync_read":
      return t.autoBackups.get(String(args.dir ?? ""))?.get(args.kind === "lock" ? "upvision-sync.lock" : "upvision-sync.json") ?? null;
    case "sync_write":
    case "sync_conflict": {
      const dir = String(args.dir ?? "");
      const folder = t.autoBackups.get(dir) ?? new Map<string, string>();
      const name = cmd === "sync_conflict" ? `upvision-conflito-${args.stamp}.json` : args.kind === "lock" ? "upvision-sync.lock" : "upvision-sync.json";
      folder.set(name, String(args.json));
      t.autoBackups.set(dir, folder);
      return cmd === "sync_conflict" ? { name, path: `${dir}/${name}`, bytes: String(args.json).length } : null;
    }
    case "sync_remove":
      t.autoBackups.get(String(args.dir ?? ""))?.delete(args.kind === "lock" ? "upvision-sync.lock" : "upvision-sync.json");
      return null;
    case "device_name":
      return "ESTE-PC";
    case "backup_read": {
      const json = t.autoBackups.get(String(args.dir ?? ""))?.get(String(args.name));
      if (json === undefined) throw new Error("backup não encontrado");
      return json;
    }
    default:
      throw new Error(`comando Tauri sem mock: ${cmd}`);
  }
}

/** Instala o mock do Tauri e um banco novo antes de cada teste do arquivo. */
export function setupTauri(): TauriState {
  const t = { files: new Map(), log: [], autoBackups: new Map(), savePath: null, openPath: null, askAnswer: true, calls: [], handlers: {}, fsScope: false, granted: { files: new Set(), dirs: new Set() }, windowStyle: { effect: "none", overlayTitlebar: false } } as unknown as TauriState;
  beforeEach(async () => {
    t.raw = new DatabaseSync(":memory:");
    t.db = wrap(t.raw);
    await migrate(t.db);
    t.files.clear();
    t.autoBackups.clear();
    t.log.length = 0;
    t.calls.length = 0;
    t.savePath = null;
    t.openPath = null;
    t.fsScope = false;
    t.granted = { files: new Set(), dirs: new Set() };
    t.askAnswer = true;
    t.handlers = {};
    t.releases = [];
    mockIPC((cmd, args) => handle(t, cmd, args));
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!String(url).startsWith("https://api.github.com/")) return realFetch(url, init);
      if (t.releases === null) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(t.releases), { status: 200 });
    });
    // mockIPC descarta os headers (o writeFile manda o caminho neles): repassa as opções também.
    const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: unknown, o?: { headers?: Record<string, string> }) => Promise<unknown> } }).__TAURI_INTERNALS__;
    internals.invoke = async (c, a, o) => handle(t, c, a, o?.headers);
    (internals as unknown as { metadata: unknown }).metadata = { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } };
  });
  return t;
}

/** render() já dentro do ToastProvider (os componentes usam useToast). */
export const renderWithApp = (ui: ReactElement, options?: RenderOptions) => render(<ToastProvider>{ui}</ToastProvider>, options);
