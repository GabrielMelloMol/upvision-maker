// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { installZoomGuard, isZoomKey } from "./zoomGuard";

/** Roda do mouse com os modificadores pedidos (o WheelEvent do happy-dom ignora ctrlKey/metaKey no construtor). */
const wheel = (init: { ctrlKey?: boolean; metaKey?: boolean; deltaY: number }) => Object.assign(new Event("wheel", { bubbles: true, cancelable: true }), { ctrlKey: false, metaKey: false, ...init });
const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
let off: () => void;
const blocked = vi.fn();

beforeEach(() => {
  blocked.mockReset();
  off = installZoomGuard(blocked);
});
afterEach(() => off());

describe("zoom da janela bloqueado (atalhos, roda, pinça) — o jeito de aumentar a letra é Preferências > Aparência", () => {
  test.each([
    [{ key: "=", ctrlKey: true }],
    [{ key: "+", ctrlKey: true, shiftKey: true }],
    [{ key: "-", ctrlKey: true }],
    [{ key: "0", ctrlKey: true }],
    [{ key: "=", metaKey: true }],
    [{ key: "-", metaKey: true }],
    [{ key: "0", metaKey: true }],
    [{ key: "Add", ctrlKey: true, code: "NumpadAdd" }],
    [{ key: "Subtract", ctrlKey: true, code: "NumpadSubtract" }],
  ])("Ctrl/⌘ + tecla de zoom %j é barrado e avisa", (init) => {
    const e = key(init);
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(blocked).toHaveBeenCalledTimes(1);
  });

  test("outros atalhos e teclas soltas passam", () => {
    for (const init of [{ key: "k", ctrlKey: true }, { key: "=" }, { key: "0" }, { key: "-" }, { key: "n", metaKey: true }, { key: "-", ctrlKey: true, altKey: true }]) {
      const e = key(init);
      window.dispatchEvent(e);
      expect(e.defaultPrevented, JSON.stringify(init)).toBe(false);
    }
    expect(blocked).not.toHaveBeenCalled();
  });

  test("Ctrl/⌘ + roda do mouse e a pinça do trackpad (que chega como roda com Ctrl) são barrados", () => {
    for (const init of [{ ctrlKey: true, deltaY: -100 }, { metaKey: true, deltaY: 100 }]) {
      const e = wheel(init);
      window.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    }
    expect(blocked).toHaveBeenCalledTimes(2);
    const plain = wheel({ deltaY: 100 });
    window.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false); // rolar a página continua igual
  });

  test("gesto de pinça do WebKit (Mac) e toque com dois dedos são barrados", () => {
    for (const type of ["gesturestart", "gesturechange"]) {
      const e = new Event(type, { bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      expect(e.defaultPrevented, type).toBe(true);
    }
    const two = new Event("touchmove", { bubbles: true, cancelable: true }) as Event & { touches: unknown[] };
    two.touches = [{}, {}];
    window.dispatchEvent(two);
    expect(two.defaultPrevented).toBe(true);
    const one = new Event("touchmove", { bubbles: true, cancelable: true }) as Event & { touches: unknown[] };
    one.touches = [{}];
    window.dispatchEvent(one);
    expect(one.defaultPrevented).toBe(false);
  });

  test("na prévia 3D a pinça e a roda com Ctrl seguem para a câmera: barra o zoom da janela mas não incomoda com o aviso", () => {
    const viewer = document.createElement("div");
    viewer.className = "viewer";
    const canvas = document.createElement("canvas");
    viewer.append(canvas);
    document.body.append(viewer);
    const e = wheel({ ctrlKey: true, deltaY: -50 });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(blocked).not.toHaveBeenCalled();
    viewer.remove();
  });

  test("desinstalar devolve o comportamento normal", () => {
    off();
    const e = key({ key: "=", ctrlKey: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    off = installZoomGuard(blocked);
  });

  test("isZoomKey só reconhece as teclas de zoom com Ctrl ou ⌘", () => {
    expect(isZoomKey(key({ key: "=", ctrlKey: true }))).toBe(true);
    expect(isZoomKey(key({ key: "=" }))).toBe(false);
  });
});
