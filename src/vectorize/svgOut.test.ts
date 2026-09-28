import { expect, test } from "vitest";
import { buildSvg, extractPaths } from "./svgOut";

const vtracerLike = `
  <svg xmlns="http://www.w3.org/2000/svg" style="background:white;"><g transform="scale(1)">
    <path d="M0 0 L10 0 L10 10 Z" transform="translate(5,6)" fill="#000000"/>
    <path d="M1,1 L2,1 L2,2 Z" transform="translate(0,0)" fill="#000000"/>
  </g></svg>`;

test("extractPaths aplica o translate e junta tudo em um único caminho", () => {
  expect(extractPaths(vtracerLike)).toBe("M5 6L15 6L15 16ZM1 1L2 1L2 2Z");
});

test("extractPaths ignora atributos perigosos e aceita só d/transform", () => {
  const evil = `<svg><path d="M0 0 L1 0 L1 1 Z" onload="alert(1)" transform="rotate(45)"/></svg>`;
  expect(() => extractPaths(evil)).toThrow(/transform/);
});

test("buildSvg grava largura em mm, altura proporcional e evenodd", () => {
  const svg = buildSvg("M0 0L10 0L10 5Z", 200, 100, 80);
  expect(svg).toContain('width="80mm"');
  expect(svg).toContain('height="40mm"');
  expect(svg).toContain('viewBox="0 0 200 100"');
  expect(svg).toContain('fill-rule="evenodd"');
});
