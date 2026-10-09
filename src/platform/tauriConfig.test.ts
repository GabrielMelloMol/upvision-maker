import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

/*
 * Config da janela no app instalado (auditoria 2026-10, A11 e M19). O Tauri junta tauri.conf.json com o arquivo da
 * plataforma por JSON Merge Patch (RFC 7396): um array no arquivo da plataforma troca o da base inteiro, então o que
 * a janela precisa tem de estar repetido lá.
 */
type Json = { [k: string]: unknown };
const read = (f: string) => JSON.parse(readFileSync(resolve(__dirname, "../../src-tauri", f), "utf8")) as Json;

/** RFC 7396: objeto mescla chave a chave, null apaga, qualquer outro valor (inclusive array) substitui. */
function mergePatch(target: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const base: Json = target && typeof target === "object" && !Array.isArray(target) ? { ...(target as Json) } : {};
  for (const [k, v] of Object.entries(patch as Json)) {
    if (v === null) delete base[k];
    else base[k] = mergePatch(base[k], v);
  }
  return base;
}

const windowOf = (platform?: string) => {
  const cfg = (platform ? mergePatch(read("tauri.conf.json"), read(`tauri.${platform}.conf.json`)) : read("tauri.conf.json")) as { app: { windows: Json[] } };
  return cfg.app.windows.find((w) => w.label === "main")!;
};

describe("janela principal no app instalado (A11, M19)", () => {
  for (const platform of [undefined, "windows", "macos"])
    test(`${platform ?? "linux (só a base)"}: arrastar e soltar do HTML5, zoom pelo teclado e janela escondida até a abertura`, () => {
      const w = windowOf(platform);
      expect(w.dragDropEnabled, "sem isso o webview consome o arrastar e soltar das telas (A11)").toBe(false);
      expect(w.zoomHotkeysEnabled, "zoom por atalho desligado de propósito (src/ui/zoomGuard.ts); explícito em cada arquivo, porque o padrão do Tauri é ligado").toBe(false);
      expect(w.visible, "a janela só aparece depois da abertura (#150)").toBe(false);
    });

  test("o merge segue a RFC 7396: array da plataforma substitui o da base", () => {
    expect(mergePatch({ a: [1, 2], b: { c: 1, d: 2 } }, { a: [3], b: { d: null } })).toEqual({ a: [3], b: { c: 1 } });
  });
});
