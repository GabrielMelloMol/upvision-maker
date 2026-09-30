import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { Model } from "../types";
import type { ModelCtx } from "./common";
import { buildStringArt, DEFAULT_STRING_ART as D, type StringArtParams } from "./stringArt";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const ctx = (art: ModelCtx["art"] = null): ModelCtx => ({ M, art, text: (s, h) => (s.trim() ? M.CrossSection.square([0.6 * h * s.trim().length, h], true) : null) });
const build = (p: Partial<StringArtParams> = {}, art: ModelCtx["art"] = null) => buildStringArt(ctx(art), { ...D, ...p });
const part = (m: Model, name: string) => m.parts.find((q) => q.name === name);

describe("string art (#58)", { timeout: 60_000 }, () => {
  test("coração com texto e fios radiais: moldura, texto e fios em partes separadas, fios mais baixos", () => {
    const [m] = build().models;
    expect(m.parts.map((q) => q.name)).toEqual(["Moldura", "Texto", "Fios"]);
    const fios = meshBounds([part(m, "Fios")!.mesh])!, mold = meshBounds([part(m, "Moldura")!.mesh])!;
    expect(fios.max[2]).toBeCloseTo(D.threadHeight);
    expect(mold.max[2]).toBeCloseTo(D.height);
    // fios ficam dentro da moldura
    expect(fios.max[0]).toBeLessThanOrEqual(mold.max[0]);
    expect(volume(part(m, "Fios")!.mesh)).toBeGreaterThan(50);
  });

  test("tamanho é o maior lado da moldura, também no coração (#129)", () => {
    for (const frame of ["heart", "circle", "rect"] as const) {
      const b = meshBounds(build({ frame, size: 250 }).models[0].parts.map((q) => q.mesh))!;
      expect(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1])).toBeLessThanOrEqual(250.01);
    }
  });

  test("padrões: vertical e cruzado; mais espaço entre fios = menos fio", () => {
    const vol = (p: Partial<StringArtParams>) => volume(part(build({ frame: "rect", ...p }).models[0], "Fios")!.mesh);
    expect(vol({ pattern: "vertical", spacing: 3 })).toBeGreaterThan(vol({ pattern: "vertical", spacing: 6 }) * 1.6);
    expect(vol({ pattern: "crossed", spacing: 4 })).toBeGreaterThan(vol({ pattern: "vertical", spacing: 4 }) * 1.5);
  });

  test("fundo opcional sobe tudo; sem fundo avisa para tirar com cuidado", () => {
    const [m] = build({ backing: true, frame: "circle" }).models;
    expect(m.parts[0].name).toBe("Fundo");
    expect(meshBounds([part(m, "Fios")!.mesh])!.min[2]).toBeCloseTo(0.8);
    expect(build().warnings!.join(" ")).toMatch(/espátula/);
  });

  test("tábua de pregos: furos na moldura e em volta do texto, sem fios", () => {
    const { models, warnings } = build({ mode: "nails", frame: "rect" });
    expect(models[0].parts.map((q) => q.name)).toEqual(["Tábua", "Texto"]);
    const n = Number(/(\d+) furos/.exec(warnings!.join(" "))![1]);
    expect(n).toBeGreaterThan(50);
  });

  test("moldura por desenho exige o desenho", () => {
    expect(() => build({ frame: "art" })).toThrow("Envie o desenho");
    expect(build({ frame: "art" }, M.CrossSection.circle(10, 64)).models[0].parts.length).toBeGreaterThan(1);
  });
});
