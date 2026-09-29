import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { bestGrid, buildNamesPanel, DEFAULT_NAMES_PANEL as D, parseNames, type NamesPanelParams } from "./namesPanel";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (): ModelCtx => ({ M, art: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const build = (p: Partial<NamesPanelParams> = {}) => buildNamesPanel(ctx(), { ...D, ...p });

test("parseNames aceita vírgula, ponto e vírgula e linha", () => {
  expect(parseNames("Ana, Bia;Caio\n\nDavi ")).toEqual(["Ana", "Bia", "Caio", "Davi"]);
});

test("bestGrid escolhe a grade com a maior letra", () => {
  // área larga e baixa: nomes em fila; área alta e estreita: em coluna
  expect(bestGrid(4, 400, 20, 3).cols).toBe(4);
  expect(bestGrid(4, 40, 400, 3).cols).toBe(1);
  const g = bestGrid(12, 184, 100, 3);
  expect(g.cols * g.rows).toBeGreaterThanOrEqual(12);
  expect(g.textH).toBeGreaterThan(8);
});

describe("painel de nomes (#54)", { timeout: 30_000 }, () => {
  test("placa no tamanho pedido, título e nomes em relevo dentro da margem, furos", () => {
    const { models, warnings } = build();
    expect(warnings).toEqual([]);
    expect(models).toHaveLength(1);
    const [plate, names] = models[0].parts;
    const b = meshBounds([plate.mesh])!;
    expect(b.max[0] - b.min[0]).toBeCloseTo(D.width, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(D.height, 1);
    const nb = meshBounds([names.mesh])!;
    expect(nb.max[0]).toBeLessThanOrEqual(D.width / 2 - D.margin + 1e-3);
    expect(nb.min[1]).toBeGreaterThanOrEqual(-D.height / 2 + D.margin - 1e-3);
    expect(nb.min[2]).toBeCloseTo(D.thickness);
    const noHoles = volume(build({ holes: false }).models[0].parts[0].mesh);
    expect(noHoles - volume(plate.mesh)).toBeCloseTo(2 * Math.PI * 2.5 ** 2 * D.thickness, -1);
  });

  test("muitos nomes: letra menor e aviso de leitura; maior que a mesa: partes com as duas cores", () => {
    const many = build({ names: Array.from({ length: 120 }, (_, i) => `Nome${i}`).join(","), width: 120, height: 80 });
    expect(many.warnings!.join(" ")).toMatch(/letra fica com/);
    const big = build({ width: 400, height: 150 });
    expect(big.models.length).toBe(2);
    for (const m of big.models) {
      expect(m.parts.map((q) => q.name)).toEqual(["Placa", "Nomes"]);
      const s = modelsBounds([m])!;
      expect(s.max[0] - s.min[0]).toBeLessThanOrEqual(256);
    }
    expect(big.warnings!.join(" ")).toMatch(/2 partes/);
  });

  test("sem nomes: prévia vazia", () => {
    expect(() => build({ names: " , " })).toThrow("Digite os nomes");
  });
});
