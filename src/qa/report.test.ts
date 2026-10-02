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
  expect(parseGcode(g)).toEqual({ seconds: 3723, grams: [], used: [], pauseZ: [2] });
  expect(parseGcode("; total estimated time: 45s").seconds).toBe(45);
});

test("gramas por filamento no G-code do Bambu e do Orca (#90)", () => {
  expect(parseGcode("; total filament weight [g] : 1.76,1.20,0.45").grams).toEqual([1.76, 1.2, 0.45]);
  expect(parseGcode("; filament used [mm] = 1156.53\n; filament used [g] = 1.94, 0.80, 0.00").grams).toEqual([1.94, 0.8, 0]);
  expect(parseGcode("; total filament weight [g] : \n; filament_density: 1.26").grams).toEqual([]); // placa sem filamento
  // Bambu 02.08: placa só com o filamento 2 sai com o peso vazio no cabeçalho, mas lista o filamento usado
  expect(parseGcode("; total filament weight [g] : \n; filament: 2").used).toEqual([2]);
});
