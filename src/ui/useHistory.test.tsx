// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useHistory } from "./useHistory";

test("desfazer e refazer; um passo novo apaga o refazer; reset limpa o histórico", () => {
  const { result } = renderHook(() => useHistory(0));
  act(() => result.current.set(1));
  act(() => result.current.set((n) => n + 1));
  expect(result.current.value).toBe(2);
  act(() => result.current.undo());
  expect(result.current).toMatchObject({ value: 1, canUndo: true, canRedo: true });
  act(() => result.current.set(5));
  expect(result.current.canRedo).toBe(false);
  act(() => result.current.reset(9));
  expect(result.current).toMatchObject({ value: 9, canUndo: false, canRedo: false });
});

test("mudanças seguidas no mesmo campo viram um passo só; outro campo abre passo novo", () => {
  const { result } = renderHook(() => useHistory({ a: "", b: 0 }));
  act(() => result.current.set((s) => ({ ...s, a: "A" }), "a"));
  act(() => result.current.set((s) => ({ ...s, a: "An" }), "a"));
  act(() => result.current.set((s) => ({ ...s, a: "Ana" }), "a"));
  act(() => result.current.set((s) => ({ ...s, b: 5 }), "b"));
  act(() => result.current.undo());
  expect(result.current.value).toEqual({ a: "Ana", b: 0 });
  act(() => result.current.undo());
  expect(result.current.value).toEqual({ a: "", b: 0 });
  expect(result.current.canUndo).toBe(false);
});
