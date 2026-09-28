import { describe, expect, test } from "vitest";
import { qrMatrix } from "../domain/qr";
import { getManifold } from "./manifold";
import { qrModel } from "./qr3d";
import { modelSize, volume } from "./testUtil";

describe("qrModel", () => {
  test("placa + QR em relevo, cada um numa parte; volumes batem com os módulos", async () => {
    const M = await getManifold();
    const m = qrMatrix("https://upvision.com.br");
    const n = m.length;
    const dark = m.flat().filter(Boolean).length;
    const { model, moduleMm, warnings } = qrModel(M, m, { sizeMm: 50, baseMm: 2, reliefMm: 1, quiet: 2 });
    expect(model.parts.map((p) => p.name)).toEqual(["Base", "QR"]);
    expect(moduleMm).toBeCloseTo(50 / (n + 4), 6);
    const [x, y, z] = modelSize(model);
    expect(x).toBeCloseTo(50, 3);
    expect(y).toBeCloseTo(50, 3);
    expect(z).toBeCloseTo(3, 3);
    expect(volume(model.parts[1].mesh)).toBeCloseTo(dark * moduleMm ** 2 * 1, 1);
    expect(warnings).toEqual([]);
  });

  test("módulo pequeno demais gera aviso de leitura", async () => {
    const M = await getManifold();
    const { warnings } = qrModel(M, qrMatrix("x".repeat(200)), { sizeMm: 20, baseMm: 2, reliefMm: 1, quiet: 2 });
    expect(warnings[0]).toMatch(/módulo/);
  });

  test("QR fica em cima da base (z de base até base+relevo)", async () => {
    const M = await getManifold();
    const { model } = qrModel(M, qrMatrix("a"), { sizeMm: 30, baseMm: 1.6, reliefMm: 0.8, quiet: 2 });
    const zs = model.parts[1].mesh.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(1.6, 4);
    expect(Math.max(...zs)).toBeCloseTo(2.4, 4);
  });
});
