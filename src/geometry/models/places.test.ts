import { beforeAll, describe, expect, test } from "vitest";
import { loadPlaces, searchPlaces, type PlaceIndex } from "./places";

let index: PlaceIndex;
beforeAll(async () => {
  index = await loadPlaces();
});

describe("lugares offline: municípios do IBGE e cidades do mundo (#196)", () => {
  test("traz todos os 5.570 municípios do Brasil e as cidades do mundo", () => {
    expect(index.brasil).toBeGreaterThanOrEqual(5570);
    expect(index.mundo).toBeGreaterThan(30000);
  });

  test("todo fuso da lista existe no Intl", () => {
    for (const tz of index.timeZones) expect(() => new Intl.DateTimeFormat("en-US", { timeZone: tz }), tz).not.toThrow();
  });

  test("São Paulo vem primeiro, com as coordenadas e o fuso certos, mesmo sem acento e em maiúsculas", () => {
    for (const q of ["São Paulo", "sao paulo", "SAO PAULO"]) {
      const [first] = searchPlaces(index, q);
      expect(first.name).toBe("São Paulo");
      expect(first.region).toBe("SP");
      expect(first.tz).toBe("America/Sao_Paulo");
      expect(first.lat).toBeCloseTo(-23.55, 1);
      expect(first.lon).toBeCloseTo(-46.64, 1);
    }
  });

  test("uma cidade pequena do interior é achada pelo nome", () => {
    const r = searchPlaces(index, "Santa Rita do Passa Quatro");
    expect(r[0]).toMatchObject({ name: "Santa Rita do Passa Quatro", region: "SP" });
    expect(searchPlaces(index, "Pirenópolis")[0]).toMatchObject({ name: "Pirenópolis", region: "GO" });
  });

  test("a sigla do estado separa homônimas: Santa Rita PB × Santa Rita MA", () => {
    expect(searchPlaces(index, "santa rita pb")[0]).toMatchObject({ name: "Santa Rita", region: "PB" });
    expect(searchPlaces(index, "santa rita ma")[0]).toMatchObject({ name: "Santa Rita", region: "MA" });
  });

  test("capital vem antes de município com nome parecido; fusos do Brasil", () => {
    expect(searchPlaces(index, "belem")[0]).toMatchObject({ name: "Belém", region: "PA" });
    expect(searchPlaces(index, "manaus")[0].tz).toBe("America/Manaus");
    expect(searchPlaces(index, "rio branco")[0].tz).toBe("America/Rio_Branco");
  });

  test("cidades do mundo em português e no nome original", () => {
    expect(searchPlaces(index, "lisboa")[0]).toMatchObject({ name: "Lisboa", region: "Portugal", tz: "Europe/Lisbon" });
    expect(searchPlaces(index, "nova york")[0].name).toBe("Nova York");
    expect(searchPlaces(index, "new york")[0].name).toBe("Nova York");
    expect(searchPlaces(index, "tokyo")[0]).toMatchObject({ name: "Tóquio", tz: "Asia/Tokyo" });
    expect(searchPlaces(index, "buenos aires")[0].region).toBe("Argentina");
  });

  test("busca vazia ou curta demais não devolve nada; o limite é respeitado", () => {
    expect(searchPlaces(index, "")).toEqual([]);
    expect(searchPlaces(index, "a")).toEqual([]);
    expect(searchPlaces(index, "santa", 5)).toHaveLength(5);
  });

  test("nome que não existe não devolve nada", () => {
    expect(searchPlaces(index, "xyzxyzxyz")).toEqual([]);
  });
});
