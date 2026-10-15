import { writeFileSync } from "node:fs";
import { test } from "vitest";
import { DESIGNS } from "./designs";
import { drawCells } from "./draw";
import { KIT_COLORS } from "./grid";

test("folha de contato dos desenhos", () => {
  const P = 40;
  const cards = DESIGNS.map((d, i) => {
    const cells = drawCells(d.grid, KIT_COLORS, P, P * 0.9);
    const body = cells.map((c) => `<path d="${c.d}" fill="${c.color.hex}"/>${c.pupil ? `<circle cx="${c.pupil.cx}" cy="${c.pupil.cy}" r="${c.pupil.r}" fill="#1c1c1e"/>` : ""}`).join("");
    const grid = Array.from({ length: 64 }, (_, j) => `<rect x="${(j % 8) * P}" y="${Math.floor(j / 8) * P}" width="${P}" height="${P}" fill="none" stroke="#c9b98f" stroke-width="1"/>`).join("");
    return `<g transform="translate(${(i % 5) * 340 + 10},${Math.floor(i / 5) * 360 + 30})"><text y="-8" font-size="16">${d.name}</text><rect width="320" height="320" fill="#e8d8b4"/>${grid}${body}</g>`;
  });
  writeFileSync("/tmp/mosaic-sheet.svg", `<svg xmlns="http://www.w3.org/2000/svg" width="1720" height="760"><rect width="100%" height="100%" fill="#fff"/>${cards.join("")}</svg>`);
});
