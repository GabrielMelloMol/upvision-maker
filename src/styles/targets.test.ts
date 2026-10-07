import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const base = readFileSync(resolve(__dirname, "base.css"), "utf8");
const px = (rule: RegExp, prop: string) => Number(new RegExp(`${prop}:\\s*(\\d+)px`).exec(rule.exec(base)![0])![1]);

// Auditoria de UX (M14): a área de toque de caixas de marcar e chaves não pode ser menor que 24 px (WCAG 2.5.8).
test("checkbox e chave (switch) têm alvo de pelo menos 24 px", () => {
  const checkbox = /input\[type="checkbox"\]\s*\{[^}]*\}/;
  expect(px(checkbox, "width")).toBeGreaterThanOrEqual(24);
  expect(px(checkbox, "height")).toBeGreaterThanOrEqual(24);
  const sw = /input\.switch\s*\{[^}]*\}/;
  expect(px(sw, "width")).toBeGreaterThanOrEqual(24);
  expect(px(sw, "height")).toBeGreaterThanOrEqual(24);
});
