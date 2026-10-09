import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { OSM_ATTRIBUTION, resetGeocode, searchAddress } from "./geocode";

const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body }) as Response);
const SAMPLE = [
  { lat: "-23.5614", lon: "-46.6559", display_name: "Avenida Paulista, 1000, Bela Vista, São Paulo, Região Imediata de São Paulo, São Paulo, Brasil", name: "", address: { road: "Avenida Paulista", city: "São Paulo", state: "São Paulo", "ISO3166-2-lvl4": "BR-SP", country_code: "br", country: "Brasil" } },
  { lat: "38.7223", lon: "-9.1393", display_name: "Lisboa, Portugal", name: "Lisboa", address: { city: "Lisboa", country: "Portugal", country_code: "pt" } },
];

beforeEach(() => {
  resetGeocode();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("busca de endereço online (Nominatim/OpenStreetMap, #196)", () => {
  test("pede ao Nominatim com a consulta, o idioma e o limite, e devolve rótulo curto e coordenadas", async () => {
    const f = reply(SAMPLE);
    const out = await searchAddress("Av Paulista 1000, São Paulo", f as unknown as typeof fetch);
    const url = new URL(String((f.mock.calls as unknown as [string][])[0][0]));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("q")).toBe("Av Paulista 1000, São Paulo");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("accept-language")).toBe("pt-BR");
    expect(Number(url.searchParams.get("limit"))).toBeLessThanOrEqual(8);
    expect(out[0]).toMatchObject({ label: "São Paulo, SP", lat: -23.5614, lon: -46.6559 });
    expect(out[0].detail).toContain("Avenida Paulista");
    expect(out[1]).toMatchObject({ label: "Lisboa, Portugal", lat: 38.7223, lon: -9.1393 });
  });

  test("a mesma consulta não pede de novo (cache) e consultas seguidas esperam 1 segundo", async () => {
    const f = reply(SAMPLE);
    const fetchFn = f as unknown as typeof fetch;
    await searchAddress("rua um, cidade", fetchFn);
    await searchAddress("rua um, cidade", fetchFn);
    expect(f).toHaveBeenCalledTimes(1);
    const second = searchAddress("rua dois, cidade", fetchFn);
    await vi.advanceTimersByTimeAsync(200);
    expect(f).toHaveBeenCalledTimes(1); // ainda esperando o intervalo da política de uso
    await vi.advanceTimersByTimeAsync(1100);
    await second;
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("consulta curta demais não vai à rede; sem resultado devolve lista vazia", async () => {
    const f = reply([]);
    await expect(searchAddress("ab", f as unknown as typeof fetch)).rejects.toThrow(/3 letras/);
    expect(f).not.toHaveBeenCalled();
    expect(await searchAddress("lugar que nao existe", f as unknown as typeof fetch)).toEqual([]);
  });

  test("sem internet ou serviço fora do ar: mensagem clara que manda usar a cidade da lista", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(searchAddress("qualquer endereço", down as unknown as typeof fetch)).rejects.toThrow(/cidade da lista/);
    resetGeocode();
    await expect(searchAddress("outro endereço", reply({}, false) as unknown as typeof fetch)).rejects.toThrow(/cidade da lista/);
  });

  test("a atribuição ao OpenStreetMap está definida", () => {
    expect(OSM_ATTRIBUTION).toMatch(/OpenStreetMap/);
  });
});
