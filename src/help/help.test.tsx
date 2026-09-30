// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PAGES } from "../pages";
import { ARTICLES, articleFor } from "./articles";
import { termFor } from "./glossary";
import { hasExample, requestExample, useExample } from "./helpStore";

test("toda tela (fora a interna de design) tem ajuda, com 3 a 5 passos (#84)", () => {
  for (const p of PAGES.filter((x) => x.id !== "design")) {
    const a = articleFor(p.id);
    expect(a, p.id).not.toBeNull();
    expect(a!.steps.length, p.id).toBeGreaterThanOrEqual(3);
    expect(a!.steps.length, p.id).toBeLessThanOrEqual(5);
  }
  expect(new Set(ARTICLES.map((a) => a.id)).size).toBe(ARTICLES.length);
});

test("termo técnico pelo rótulo do campo, sem ligar para acento e maiúsculas", () => {
  expect(termFor("Relevo do texto")?.id).toBe("relevo");
  expect(termFor("Folga do encaixe")?.id).toBe("folga");
  expect(termFor("POTÊNCIA (W)")?.id).toBe("potencia");
  expect(termFor("Nome")).toBeNull();
});

test("exemplo pedido antes de a ferramenta abrir é carregado quando ela registra", () => {
  const load = vi.fn();
  requestExample("teste");
  expect(hasExample("teste")).toBe(false);
  const { unmount } = renderHook(() => useExample("teste", load));
  expect(load).toHaveBeenCalledTimes(1);
  expect(hasExample("teste")).toBe(true);
  act(() => requestExample("teste"));
  expect(load).toHaveBeenCalledTimes(2);
  unmount();
  expect(hasExample("teste")).toBe(false);
});
