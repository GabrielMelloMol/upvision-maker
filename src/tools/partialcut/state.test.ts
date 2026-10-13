import { describe, expect, test } from "vitest";
import { addedCut, cutForEngine, freshCut, initialState, migrate } from "./state";

const bounds = { min: [0, 0, 0] as [number, number, number], max: [20, 20, 40] as [number, number, number] };

describe("estado do corte parcial", () => {
  test("projeto da 1ª versão (um corte em opts, com a caixa antiga) abre como lista com um corte", () => {
    const old = { opts: { axis: "x", tilt: 0, offset: 7, pin: "round", mode: "loose", size: 0, clearance: 0.2, explode: 0, box: { min: [0, 0, 0], max: [5, 5, 5] } }, limit: false, pick: "plane" };
    const s = migrate(old);
    expect(s.cuts).toHaveLength(1);
    expect(s.cuts[0]).toMatchObject({ axis: "x", offset: 7, limit: false, color: null, region: { kind: "box", max: [5, 5, 5] } });
    expect(s.pick).toBe("plane");
  });

  test("projeto novo volta igual (lista de cortes, corte ativo e cor do resto)", () => {
    const a = { ...initialState(), cuts: [freshCut(bounds), addedCut(bounds)], active: 1, restColor: "#112233" };
    const { file, ...rest } = a;
    expect(file).toBeNull();
    expect(migrate(JSON.parse(JSON.stringify(rest)))).toEqual(rest);
  });

  test("corte novo fica abaixo do primeiro; cutForEngine prende o plano na peça e tira a região se desligada", () => {
    expect(addedCut(bounds).offset).toBeLessThan(freshCut(bounds).offset);
    const c = { ...freshCut(bounds), offset: 999, limit: false };
    const e = cutForEngine(c, bounds);
    expect(e.offset).toBe(40);
    expect(e.region).toBeNull();
    expect("limit" in e).toBe(false);
  });
});
