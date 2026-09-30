import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("ícone do Windows (#138): .ico com 16, 24, 32, 48, 64 e 256 px em PNG", () => {
  const ico = readFileSync("src-tauri/icons/icon.ico");
  const count = ico.readUInt16LE(4);
  const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + 16 * i) || 256).sort((a, b) => a - b);
  expect(sizes).toEqual([16, 24, 32, 48, 64, 256]);
});

test("símbolo segue a cor do tema na estrutura e não tem fundo", () => {
  const svg = readFileSync("src/assets/brand/mark.svg", "utf8");
  expect(svg).toContain('fill="currentColor"');
  expect(svg).not.toMatch(/#fff\b|#ffffff/i);
});
