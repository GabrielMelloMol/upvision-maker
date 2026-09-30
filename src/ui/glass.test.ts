// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";
import { glassMode, installGlass } from "./glass";

const nav = (userAgent: string, hardwareConcurrency = 8, deviceMemory = 8) => ({ userAgent, hardwareConcurrency, deviceMemory });
const CHROME = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0";
const SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const mediaMatches = (on: string[]) => vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: on.some((x) => q.includes(x)), addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);

afterEach(() => {
  vi.restoreAllMocks();
  delete document.documentElement.dataset.glass;
  document.getElementById("lg-refract")?.closest("svg")?.remove();
});

test("modo do vidro: refração só no Chromium (WebView2), CSS no WebKit, simples em máquina fraca e opaco com reduzir transparência (#139)", () => {
  mediaMatches([]);
  expect(glassMode(nav(CHROME))).toBe("refract");
  expect(glassMode(nav(SAFARI))).toBe("css");
  expect(glassMode(nav(CHROME, 4))).toBe("lite");
  expect(glassMode(nav(CHROME, 8, 2))).toBe("lite");
  mediaMatches(["reduced-motion"]);
  expect(glassMode(nav(CHROME))).toBe("lite");
  mediaMatches(["reduced-transparency"]);
  expect(glassMode(nav(SAFARI))).toBe("off");
});

test("installGlass marca a raiz, põe o filtro de refração e o brilho segue o mouse na sheet", async () => {
  const stop = installGlass("refract");
  expect(document.documentElement.dataset.glass).toBe("refract");
  expect(document.getElementById("lg-refract")?.querySelector("feDisplacementMap")).toBeTruthy();
  const sheet = document.createElement("dialog");
  sheet.className = "sheet";
  document.body.appendChild(sheet);
  sheet.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 40, clientY: 25 }));
  await new Promise((ok) => requestAnimationFrame(() => ok(null)));
  expect(sheet.style.getPropertyValue("--mx")).toMatch(/px$/);
  stop();
  sheet.remove();
});

test("lite e off: sem filtro e sem acompanhar o mouse", () => {
  installGlass("lite")();
  expect(document.documentElement.dataset.glass).toBe("lite");
  expect(document.getElementById("lg-refract")).toBeNull();
});
