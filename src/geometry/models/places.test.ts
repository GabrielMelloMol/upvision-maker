import { beforeAll, describe, expect, test } from "vitest";
import brasilRaw from "../../data/places/brasil.txt?raw";
import mundoRaw from "../../data/places/mundo.txt?raw";
import { loadPlaces, parsePlaces, searchPlaces, type PlaceIndex } from "./places";
import { resolveTz } from "./placeTime";

let index: PlaceIndex;
beforeAll(async () => {
  index = await loadPlaces();
});

describe("lugares offline: municípios do IBGE e cidades do mundo (#196)", () => {
  test("traz todos os 5.570 municípios do Brasil e as cidades do mundo", () => {
    expect(index.brasil).toBeGreaterThanOrEqual(5570);
    expect(index.mundo).toBeGreaterThan(30000);
  });

  test("todo fuso da lista é conhecido (direto ou por equivalente) e nenhum traz sobra de fim de linha", () => {
    for (const tz of index.timeZones) {
      expect(tz, JSON.stringify(tz)).toMatch(/^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)*$/);
      expect(() => resolveTz(tz), tz).not.toThrow();
    }
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

  // Windows (e o Git com autocrlf) entrega os arquivos com \r\n: o \r grudava no último fuso ("America/Noronha\r", inválido
  // no Intl) e na marca de capital ("1\r" ≠ "1"), e a capital perdia a ordem para uma cidade estrangeira (v0.11.7)
  describe("arquivos com fim de linha do Windows (CRLF)", () => {
    const crlf = (s: string) => s.replace(/\n/g, "\r\n");
    test("dão exatamente as mesmas cidades, fusos e marcas de capital", () => {
      for (const [raw, source] of [[brasilRaw, "br"], [mundoRaw, "world"]] as const) {
        const lf = parsePlaces(raw, source, null), win = parsePlaces(crlf(raw), source, null);
        expect(win.tzs).toEqual(lf.tzs);
        expect(win.entries).toEqual(lf.entries);
        expect(win.tzs.some((t) => /\s/.test(t))).toBe(false);
      }
    });

    test("a capital continua antes do município e da cidade estrangeira de nome igual", () => {
      const br = parsePlaces(crlf(brasilRaw), "br", null), world = parsePlaces(crlf(mundoRaw), "world", null);
      const win: PlaceIndex = { brasil: br.entries.length, mundo: world.entries.length, timeZones: [...br.tzs, ...world.tzs], entries: [...br.entries, ...world.entries] };
      expect(searchPlaces(win, "belem")[0]).toMatchObject({ name: "Belém", region: "PA", source: "br" });
      expect(searchPlaces(win, "sao paulo")[0]).toMatchObject({ name: "São Paulo", region: "SP" });
    });
  });

  test("a ordem não depende do idioma do sistema: sem localeCompare, empates pelo Brasil primeiro e depois pelo nome sem acento", () => {
    const names = (q: string) => searchPlaces(index, q, 30).map((p) => `${p.name}|${p.region}`);
    const original = String.prototype.localeCompare;
    String.prototype.localeCompare = () => {
      throw new Error("a busca não pode usar localeCompare");
    };
    try {
      expect(() => names("santa")).not.toThrow();
    } finally {
      String.prototype.localeCompare = original;
    }
    const a = names("santa");
    expect(a).toEqual(names("santa"));
    // empate de verdade (mesma combinação, mesma população): o Brasil vem antes; depois o nome sem acento, em ordem de código
    const mk = (name: string, source: "br" | "world", region: string): PlaceIndex["entries"][number] => ({ name, region, lat: 0, lon: 0, tz: "UTC", source, label: name, key: name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""), alt: "", regionKey: region.toLowerCase(), rank: 5000 });
    const tie: PlaceIndex = { brasil: 2, mundo: 1, timeZones: ["UTC"], entries: [mk("Belem", "world", "Portugal"), mk("Belém", "br", "PA"), mk("Belem", "br", "AL")] };
    expect(searchPlaces(tie, "belem").map((p) => `${p.name}|${p.region}`)).toEqual(["Belem|AL", "Belém|PA", "Belem|Portugal"]);
  });
});
