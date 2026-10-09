// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { INTENT_TTL_MS, openWith, peekIntent, settleIntent, takeIntent, useTakenIntent } from "./intent";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  settleIntent("t");
  vi.useRealTimers();
});

describe("pedido de abertura entre telas", () => {
  test("takeIntent pega e apaga; peekIntent só lê", () => {
    expect(takeIntent("t")).toBeUndefined();
    openWith("t", { id: "starMap" });
    expect(peekIntent("t")).toEqual({ id: "starMap" });
    expect(peekIntent("t")).toEqual({ id: "starMap" });
    expect(takeIntent("t")).toEqual({ id: "starMap" });
    expect(takeIntent("t")).toBeUndefined();
  });

  test("a tela que monta lê o pedido, mesmo se o desenho for refeito depois (erro passageiro, Suspense): só some quando monta", () => {
    openWith("t", { id: "starMap" });
    const first = renderHook(() => useTakenIntent<{ id: string }>("t"));
    expect(first.result.current).toEqual({ id: "starMap" });
    // a montagem confirmou: o pedido foi entregue
    expect(peekIntent("t")).toBeUndefined();
    first.unmount();
    // quem monta de novo depois (sem pedido novo) não herda o modelo anterior
    expect(renderHook(() => useTakenIntent("t")).result.current).toBeUndefined();
  });

  test("desenho descartado antes de montar (sem efeito rodar): o pedido continua à espera do desenho seguinte", () => {
    openWith("t", { id: "starMap" });
    expect(peekIntent("t")).toEqual({ id: "starMap" }); // 1º desenho, jogado fora
    vi.advanceTimersByTime(2000); // o React demorou (Suspense)
    expect(peekIntent("t")).toEqual({ id: "starMap" }); // 2º desenho
  });

  test("pedido que ninguém leu em 10 s é descartado: não vira modelo fantasma", () => {
    openWith("t", { id: "starMap" });
    vi.advanceTimersByTime(INTENT_TTL_MS + 1);
    expect(peekIntent("t")).toBeUndefined();
  });

  test("um pedido novo vale no lugar do anterior; pedidos de ferramentas diferentes não se misturam", () => {
    openWith("t", { id: "a" });
    openWith("t", { id: "b" });
    openWith("lithophane", { mode: "shadowbox" });
    expect(takeIntent("t")).toEqual({ id: "b" });
    expect(takeIntent("lithophane")).toEqual({ mode: "shadowbox" });
  });
});
