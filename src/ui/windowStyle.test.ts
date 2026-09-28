// @vitest-environment happy-dom
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, test } from "vitest";
import { applyWindowStyle } from "./windowStyle";

afterEach(() => clearMocks());

describe("applyWindowStyle", () => {
  test("Mica aplicada: marca o <html> para deixar a sidebar transparente", async () => {
    mockIPC((cmd) => (cmd === "window_style" ? { effect: "mica", overlayTitlebar: false } : null));
    const root = document.createElement("html");
    await applyWindowStyle(root);
    expect(root.dataset.vibrancy).toBe("mica");
    expect(root.dataset.titlebar).toBeUndefined();
  });

  test("Windows 10 / sem efeito: nenhum atributo, fica tudo opaco", async () => {
    mockIPC(() => ({ effect: "none", overlayTitlebar: false }));
    const root = document.createElement("html");
    await applyWindowStyle(root);
    expect(root.dataset.vibrancy).toBeUndefined();
  });

  test("comando indisponível (navegador, versão antiga do Rust): cai no opaco sem erro", async () => {
    mockIPC(() => {
      throw new Error("command window_style not found");
    });
    const root = document.createElement("html");
    await expect(applyWindowStyle(root)).resolves.toEqual({ effect: "none", overlayTitlebar: false });
    expect(root.dataset.vibrancy).toBeUndefined();
  });

  test("macOS: material sidebar e barra de título sobreposta", async () => {
    mockIPC(() => ({ effect: "sidebar", overlayTitlebar: true }));
    const root = document.createElement("html");
    await applyWindowStyle(root);
    expect(root.dataset.vibrancy).toBe("sidebar");
    expect(root.dataset.titlebar).toBe("overlay");
  });
});
