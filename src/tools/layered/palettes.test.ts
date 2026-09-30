import { expect, test } from "vitest";
import { bandPreview, presetPalettes } from "./palettes";

const SHELF = ["#1c1c1e", "#f8f8f6", "#8e8e93", "#d62828", "#f7c52b", "#1d4ed8", "#e8b89a", "#6b3a2a", "#f4b6c2", "#a7d8f0"];

test("paletas prontas saem dos filamentos cadastrados, do escuro ao claro, sem repetir", () => {
  const ps = presetPalettes(SHELF);
  expect(ps.map((p) => p.id)).toEqual(["bw", "warm", "pop", "pastel"]);
  const byId = Object.fromEntries(ps.map((p) => [p.id, p.colors]));
  expect(byId.bw).toEqual(["#1c1c1e", "#8e8e93", "#f8f8f6"]);
  expect(byId.warm).toContain("#6b3a2a");
  expect(byId.warm).toContain("#e8b89a");
  expect(byId.pop).toContain("#d62828");
  expect(byId.pastel.some((c) => c === "#f4b6c2" || c === "#a7d8f0")).toBe(true);
  for (const p of ps) {
    expect(new Set(p.colors).size).toBe(p.colors.length);
    expect(p.colors[0]).toBe("#1c1c1e");
    expect(p.colors.at(-1)).toBe("#f8f8f6");
  }
});

test("com poucos filamentos só entram as paletas que dão para montar", () => {
  const ps = presetPalettes(["#000000", "#ffffff"]);
  expect(ps.map((p) => p.id)).toEqual(["bw"]);
  expect(presetPalettes(["#000000"])).toEqual([]);
});

test("miniatura: cada ponto vira a cor da faixa em que o claro dele cai", () => {
  const luma = Float32Array.from([0, 0.4, 0.7, 1]);
  const rgba = bandPreview(luma, ["#000000", "#808080", "#ffffff"]);
  const px = (i: number) => Array.from(rgba.slice(i * 4, i * 4 + 3));
  expect(px(0)).toEqual([0, 0, 0]);
  expect(px(1)).toEqual([128, 128, 128]);
  expect(px(3)).toEqual([255, 255, 255]);
});
