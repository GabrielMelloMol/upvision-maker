import { test as base, expect, type Page } from "@playwright/test";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

/**
 * Mock do IPC do Tauri para rodar o app no Vite puro.
 * Mesmo formato do `mockIPC` de @tauri-apps/api/mocks, mas o handler roda no Node:
 * SQL vai para um SQLite em memória (node:sqlite) e os arquivos "salvos" ficam em `files`.
 */
export type TauriMock = {
  db: DatabaseSync;
  /** Caminho → conteúdo gravado pelo app (write_file / write_text_file). */
  files: Map<string, Buffer>;
  /** Arquivos que o diálogo "Abrir" pode devolver (read_text_file lê daqui também). */
  nextOpen: string | null;
  /** Resposta do diálogo "Salvar como": null simula cancelar. Default: /saida/<nome sugerido>. */
  savePath: ((defaultPath: string) => string | null) | null;
  /** Resposta de ask()/confirm(). */
  askAnswer: boolean;
  calls: string[];
  /** Resposta do updater (latest.json): null = sem atualização. */
  update: { rid: number; currentVersion: string; version: string; date: null; body: null; rawJson: object } | null;
  /** Resposta da API de releases do GitHub (interceptada; null = sem internet). */
  releases: unknown[] | null;
  /** Links abertos pelo app (opener). */
  opened: string[];
  /** Linhas gravadas no registro de diagnóstico (log_append). */
  log: string[];
  /** Backups automáticos "no disco": pasta → (nome → conteúdo). */
  autoBackups: Map<string, Map<string, string>>;
  /** Resposta do comando window_style (material nativo). */
  windowStyle: { effect: "mica" | "sidebar" | "none"; overlayTitlebar: boolean };
};

const INIT = () => {
  const b64 = (u: Uint8Array) => {
    let s = "";
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  let nextId = 1;
  const w = window as unknown as Record<string, unknown>;
  w.__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args: unknown, options?: { headers?: Record<string, string> }) => {
      const payload = args instanceof Uint8Array ? { __bytes: b64(args) } : (args ?? null);
      const r = (await (w.__tauriInvoke as (c: string, a: unknown, h: unknown) => Promise<{ ok?: unknown; err?: string }>)(cmd, payload, options?.headers ?? null));
      if (r.err !== undefined) throw r.err;
      return r.ok;
    },
    transformCallback: (cb: (d: unknown) => void) => {
      const id = nextId++;
      w[`_${id}`] = cb;
      return id;
    },
    unregisterCallback: (id: number) => delete w[`_${id}`],
    convertFileSrc: (p: string) => p,
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
  };
};

type ApplyStockArgs = {
  movements: { kind: "filament" | "material" | "product"; id: number; delta: number }[];
  order: { orderId: number; expectApplied: boolean; setApplied: boolean; status: string; note: string; appliedPlan: string | null; deliveredAt: string | null; delete?: boolean } | null;
};

/** Mesmo contrato do comando Rust (src-tauri/src/stock.rs), numa transação do node:sqlite. */
function applyStock(m: TauriMock, { movements, order }: ApplyStockArgs): null {
  const col = { filament: ["filaments", "stockG"], material: ["materials", "stock"], product: ["products", "stock"] } as const;
  m.db.exec("BEGIN");
  try {
    if (order) {
      const row = m.db.prepare("SELECT stockApplied FROM orders WHERE id = ?").get(order.orderId) as { stockApplied: number } | undefined;
      if (!row) throw "Pedido não encontrado.";
      if ((row.stockApplied !== 0) !== order.expectApplied) throw "O estoque deste pedido já foi atualizado por outra ação.";
    }
    for (const mv of movements) {
      const [t, c] = col[mv.kind];
      if (m.db.prepare(`UPDATE ${t} SET ${c} = ${c} + ? WHERE id = ?`).run(mv.delta, mv.id).changes === 0) throw `Item de estoque não encontrado (${t} #${mv.id}).`;
    }
    if (order?.delete) for (const t of ["order_items WHERE orderId", "order_history WHERE orderId", "orders WHERE id"]) m.db.prepare(`DELETE FROM ${t} = ?`).run(order.orderId);
    else if (order) {
      m.db.prepare("UPDATE orders SET stockApplied = ?, status = ?, appliedPlan = ?, deliveredAt = ? WHERE id = ?").run(order.setApplied ? 1 : 0, order.status, order.appliedPlan, order.deliveredAt, order.orderId);
      m.db.prepare("INSERT INTO order_history (orderId, status, note, at) VALUES (?, ?, ?, datetime('now'))").run(order.orderId, order.status, order.note);
    }
    m.db.exec("COMMIT");
  } catch (e) {
    m.db.exec("ROLLBACK");
    throw e;
  }
  return null;
}

function handler(m: TauriMock, cmd: string, a: Record<string, unknown> | null, headers: Record<string, string> | null): unknown {
  const args = a ?? {};
  const params = (args.values as SQLInputValue[] | undefined) ?? [];
  switch (cmd) {
    case "apply_stock":
      return applyStock(m, args as unknown as ApplyStockArgs);
    case "plugin:sql|load":
      return args.db;
    case "plugin:sql|select":
      return m.db.prepare(String(args.query)).all(...params);
    case "plugin:sql|execute": {
      const r = m.db.prepare(String(args.query)).run(...params);
      return [Number(r.changes), Number(r.lastInsertRowid)];
    }
    case "plugin:dialog|save": {
      const opts = (args.options ?? {}) as { defaultPath?: string };
      const name = opts.defaultPath ?? "arquivo";
      return m.savePath ? m.savePath(name) : `/saida/${name}`;
    }
    case "plugin:dialog|open":
      return m.nextOpen;
    case "plugin:dialog|message": {
      const custom = (args.buttons as { OkCancelCustom?: [string, string] } | undefined)?.OkCancelCustom;
      return custom ? custom[m.askAnswer ? 0 : 1] : m.askAnswer ? "Yes" : "No";
    }
    case "plugin:fs|write_file":
    case "plugin:fs|write_text_file": {
      const path = decodeURIComponent(headers?.path ?? "");
      m.files.set(path, Buffer.from(String(args.__bytes ?? ""), "base64"));
      return null;
    }
    case "plugin:fs|read_text_file": {
      const f = m.files.get(String(args.path));
      if (!f) throw new Error(`arquivo não existe: ${args.path}`);
      return [...f]; // o plugin decodifica bytes → texto
    }
    case "plugin:fs|mkdir":
      return null;
    case "plugin:path|resolve_directory":
      return "/dados-app";
    case "plugin:path|join":
      return (args.paths as string[]).join("/");
    case "plugin:app|version":
      return "0.2.0";
    case "plugin:updater|check":
      return m.update;
    case "window_style":
      return m.windowStyle;
    case "plugin:event|listen":
      return 1;
    case "plugin:event|unlisten":
      return null;
    case "log_append":
      m.log.push(String(args.line));
      return null;
    case "log_read":
      return m.log.length ? `${m.log.join("\n")}\n` : "";
    case "backup_default_dir":
      return "/dados-app/backups/auto";
    case "backup_write": {
      const dir = String(args.dir ?? "");
      const folder = m.autoBackups.get(dir) ?? new Map<string, string>();
      const name = `upvision-auto-${args.stamp}.json`;
      for (const k of [...folder.keys()]) if (k.startsWith(`upvision-auto-${String(args.stamp).slice(0, 10)}`)) folder.delete(k);
      folder.set(name, String(args.json));
      const keep = [...folder.keys()].sort().reverse().slice(0, Number(args.keep));
      for (const k of [...folder.keys()]) if (!keep.includes(k)) folder.delete(k);
      m.autoBackups.set(dir, folder);
      return { name, path: `${dir || "/dados-app/backups/auto"}/${name}`, bytes: String(args.json).length };
    }
    case "backup_list":
      return [...(m.autoBackups.get(String(args.dir ?? "")) ?? new Map<string, string>()).entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([name, json]) => ({ name, path: `${args.dir || "/dados-app/backups/auto"}/${name}`, bytes: json.length }));
    case "backup_read": {
      const json = m.autoBackups.get(String(args.dir ?? ""))?.get(String(args.name));
      if (json === undefined) throw new Error("backup não encontrado");
      return json;
    }
    case "plugin:opener|open_url":
      m.opened.push(String(args.url));
      return null;
    default:
      throw new Error(`comando Tauri sem mock: ${cmd}`);
  }
}

export const test = base.extend<{ tauri: TauriMock }>({
  tauri: async ({ page }, provide) => {
    const m: TauriMock = { db: new DatabaseSync(":memory:"), files: new Map(), nextOpen: null, savePath: null, askAnswer: true, calls: [], opened: [], log: [], update: null, releases: [], autoBackups: new Map(), windowStyle: { effect: "none", overlayTitlebar: false } };
    await page.exposeFunction("__tauriInvoke", (cmd: string, a: Record<string, unknown> | null, h: Record<string, string> | null) => {
      m.calls.push(cmd);
      try {
        return { ok: handler(m, cmd, a, h) };
      } catch (e) {
        return { err: e instanceof Error ? e.message : String(e) };
      }
    });
    await page.addInitScript(INIT);
    await page.route("https://api.github.com/**", (route) =>
      m.releases === null ? route.abort("internetdisconnected") : route.fulfill({ json: m.releases, headers: { "access-control-allow-origin": "*" } }),
    );
    await provide(m);
    m.db.close();
  },
});

export { expect };

/** Abre o app (fecha a apresentação de primeiro uso, a menos que `keepOnboarding`). */
export async function openApp(page: Page, { keepOnboarding = false } = {}) {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
  const welcome = page.getByRole("dialog", { name: "Boas-vindas ao UpVision Maker" });
  await expect(welcome).toBeVisible();
  if (!keepOnboarding) {
    await welcome.getByRole("button", { name: "Agora não" }).click();
    await expect(welcome).toBeHidden();
  }
}

/** Toast (ok = status, erro = alert) com o texto. */
export const toastWith = (page: Page, text: string) => page.locator(".toast", { hasText: text });

export async function go(page: Page, label: string | RegExp) {
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: label }).click();
}
