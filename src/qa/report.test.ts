import { expect, test } from "vitest";
import { mergeRows, renderReport, statusOf, type QaRow } from "./report";
import { parseGcode } from "./slicer";

const row = (key: string, owner: string, patch: Partial<QaRow> = {}): QaRow => ({ key, owner, group: "g", label: key, variant: "padrão", status: "ok", reasons: [], date: "2026-09-29", ...patch });

test("rodada nova só troca os casos que rodou; relatório com uma seção por dono", () => {
  const merged = mergeRows([row("a:padrão", "Forja"), row("b:padrão", "Torno")], [row("a:padrão", "Forja", { status: "falha", reasons: ["não fatiou"] })]);
  expect(merged.map((r) => `${r.key}=${r.status}`)).toEqual(["a:padrão=falha", "b:padrão=ok"]);
  const md = renderReport(merged, "# QA");
  expect(md).toContain("## Forja");
  expect(md).toContain("## Torno");
  expect(md).toContain("❌ falha");
  expect(md).toContain("1 com falha");
});

test("status: falha pesa mais que aviso; n/a quando falta entrada", () => {
  expect(statusOf(["x"], ["y"])).toBe("falha");
  expect(statusOf([], ["y"])).toBe("aviso");
  expect(statusOf([], [])).toBe("ok");
  expect(statusOf([], [], true)).toBe("n/a");
});

test("G-code do Bambu: tempo total e Z de cada pausa M400 U1", () => {
  const g = ["; total estimated time: 1h 2m 3s", "; Z_HEIGHT: 1.8", "; Z_HEIGHT: 2", "M400 U1", "; Z_HEIGHT: 2.2"].join("\n");
  expect(parseGcode(g)).toEqual({ seconds: 3723, pauseZ: [2] });
  expect(parseGcode("; total estimated time: 45s").seconds).toBe(45);
});
