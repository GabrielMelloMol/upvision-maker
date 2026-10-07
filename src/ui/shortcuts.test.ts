// @vitest-environment happy-dom
import { afterEach, expect, test } from "vitest";
import { installShortcuts, redoHint, undoHint } from "./shortcuts";

/** Auditoria 2026-10, B15: F5, Ctrl+R e Ctrl+Shift+R recarregam o app inteiro no Windows (perde o desfazer e o que não foi salvo). */
let off: (() => void) | undefined;
afterEach(() => off?.());
const press = (init: KeyboardEventInit) => {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

test("no app instalado, F5 e Ctrl/⌘+R (com ou sem Shift) não recarregam", () => {
  off = installShortcuts({ openPalette: () => {}, blockReload: true });
  expect(press({ key: "F5" })).toBe(true);
  expect(press({ key: "r", ctrlKey: true })).toBe(true);
  expect(press({ key: "R", ctrlKey: true, shiftKey: true })).toBe(true);
  expect(press({ key: "r", metaKey: true })).toBe(true);
});

test("em desenvolvimento o recarregar continua valendo", () => {
  off = installShortcuts({ openPalette: () => {}, blockReload: false });
  expect(press({ key: "F5" })).toBe(false);
  expect(press({ key: "r", ctrlKey: true })).toBe(false);
});

test("a tecla R sozinha, com a busca aberta ou digitando, não é bloqueada", () => {
  off = installShortcuts({ openPalette: () => {}, blockReload: true });
  expect(press({ key: "r" })).toBe(false);
  expect(press({ key: "k", ctrlKey: true })).toBe(true); // o atalho da busca segue funcionando
});


/** B21: o texto dos atalhos acompanha o sistema (⌘ no Mac, Ctrl no Windows). */
const asPlatform = (platform: string, fn: () => void) => {
  Object.defineProperty(navigator, "platform", { configurable: true, value: platform });
  try {
    fn();
  } finally {
    delete (navigator as unknown as Record<string, unknown>).platform; // volta ao do navegador
  }
};

test("dica de desfazer e refazer: ⌘ no Mac; Ctrl, com Ctrl+Y, no Windows", () => {
  asPlatform("MacIntel", () => {
    expect(undoHint()).toBe("⌘Z");
    expect(redoHint()).toBe("⇧⌘Z");
  });
  asPlatform("Win32", () => {
    expect(undoHint()).toBe("Ctrl+Z");
    expect(redoHint()).toBe("Ctrl+Y");
  });
});
