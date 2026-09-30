import { afterEach, describe, expect, test } from "vitest";
import { bed, bedFor, bedMm, DEFAULT_BED, parseVolume, setBed } from "./bed";

afterEach(() => setBed(null));

describe("mesa da impressora escolhida (#119)", () => {
  test("volume do catálogo: caixa, sem altura e delta (mesa redonda)", () => {
    expect(parseVolume("256×256×256")).toEqual({ x: 256, y: 256, z: 256 });
    expect(parseVolume("180×180×180")).toEqual({ x: 180, y: 180, z: 180 });
    expect(parseVolume("250 x 210 x 220")).toEqual({ x: 250, y: 210, z: 220 });
    expect(parseVolume("300×300")).toEqual({ x: 300, y: 300, z: 300 });
    expect(parseVolume("Ø300×410")).toEqual({ x: 212, y: 212, z: 410 }); // 300/√2
    expect(parseVolume("")).toBeNull();
    expect(parseVolume("grande")).toBeNull();
  });

  test("a escolhida manda; senão a primeira; fora do catálogo ou sem impressora, 256 mm", () => {
    const printers = [
      { id: 1, name: "Bambu Lab A1" },
      { id: 2, name: "Bambu Lab A1 mini" },
      { id: 3, name: "Minha caseira" },
    ];
    const volumes: Record<string, string> = { "Bambu Lab A1": "256×256×256", "Bambu Lab A1 mini": "180×180×180" };
    const of = (n: string) => volumes[n];
    expect(bedFor(printers, 2, of)).toEqual({ x: 180, y: 180, z: 180, name: "Bambu Lab A1 mini" });
    expect(bedFor(printers, null, of)).toMatchObject({ x: 256, name: "Bambu Lab A1" });
    expect(bedFor(printers, 99, of)).toMatchObject({ x: 256, name: "Bambu Lab A1" }); // escolhida foi excluída
    expect(bedFor(printers, 3, of)).toEqual({ ...DEFAULT_BED, name: "Minha caseira" });
    expect(bedFor([], null, of)).toEqual(DEFAULT_BED);
  });

  test("lado útil: o menor lado da mesa retangular; sem impressora, o padrão", () => {
    expect(bedMm()).toBe(256);
    setBed({ x: 250, y: 210, z: 220 });
    expect(bedMm()).toBe(210);
    expect(bed().z).toBe(220);
    setBed(null);
    expect(bedMm()).toBe(256);
  });
});
