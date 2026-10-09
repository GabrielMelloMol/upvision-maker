// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from "vitest";

const setZoom = vi.fn(async () => {});
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ setZoom }) }));

beforeEach(() => {
  setZoom.mockClear();
  localStorage.clear();
});

describe("tamanho do texto ao abrir", () => {
  test("sem zoom salvo, o app abre em 100% (desfaz qualquer zoom que o WebView2 tenha lembrado de um atalho)", async () => {
    const { openingZoom } = await import("./zoom");
    await openingZoom();
    expect(setZoom).toHaveBeenCalledWith(1);
  });

  test("com Tamanho do texto salvo nas Preferências, abre com ele", async () => {
    const { applyZoom, openingZoom } = await import("./zoom");
    await applyZoom("1.3", true);
    setZoom.mockClear();
    await openingZoom();
    expect(setZoom).toHaveBeenCalledWith(1.3);
  });

  test("valor salvo inválido (adulterado) volta a 100%", async () => {
    localStorage.setItem("upvision:zoom", "9");
    const { openingZoom } = await import("./zoom");
    await openingZoom();
    expect(setZoom).toHaveBeenCalledWith(1);
  });
});
