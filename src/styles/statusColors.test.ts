import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const read = (f: string) => readFileSync(resolve(__dirname, f), "utf8");
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Auditoria de UX (A4): o lucro e o prejuízo do Painel e do Financeiro usavam as cores de preenchimento dos gráficos
// (--viz-good #0ca30c e --viz-bad #d03b3b), que não chegam a 4,5:1 como texto (2,97:1 no escuro). Texto usa --ok e --danger.
test("o texto de bom e ruim usa --ok e --danger, e os dois passam de 4,5:1 nos dois temas", () => {
  const tokens = read("tokens.css");
  const dark = tokens.slice(tokens.indexOf("@media (prefers-color-scheme: dark)"));
  const val = (css: string, name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1];
  for (const name of ["--ok", "--danger"]) {
    expect(ratio(val(tokens, name), "#ffffff"), `${name} no claro`).toBeGreaterThanOrEqual(4.5);
    expect(ratio(val(dark, name), "#2a2a2e"), `${name} no escuro`).toBeGreaterThanOrEqual(4.5);
  }
  const css = read("features.css");
  expect(css).not.toMatch(/color:\s*var\(--viz-(good|bad)\)/);
  expect(css).toMatch(/\.stat-delta\.good\s*\{\s*color:\s*var\(--ok\)/);
  expect(css).toMatch(/\.stat-delta\.bad\s*\{\s*color:\s*var\(--danger\)/);
});

// Auditoria de UX (M12, M13): texto de apoio sobre fundos que não seguem o tema.
test("legenda da litofania sobre o quadro preto e HUD das medidas têm contraste de texto", () => {
  const tools = read("tools.css");
  const color = /\.pair \.img\.dark-box \.muted\s*\{\s*color:\s*(#[0-9a-fA-F]{6})/.exec(tools)![1];
  expect(ratio(color, "#111111")).toBeGreaterThanOrEqual(4.5);
  expect(tools).toMatch(/\.viewer \.hud\s*\{\s*background:\s*color-mix\(in srgb, var\(--surface\) 9\d%/);
});
