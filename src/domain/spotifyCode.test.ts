import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchScannable, ScannableError } from "./spotifyCode";

const SAMPLE = readFileSync("tests/fixtures/spotify/scannable-track.svg", "utf8");
const URI = "spotify:track:11dFghVXANMlKmJXsNCbNl";
const reply = (body: string, status = 200) => vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
const reason = async (p: Promise<unknown>) => (await p.catch((e: unknown) => e)) as ScannableError;

afterEach(() => vi.useRealTimers());

describe("buscar o código do Spotify", () => {
  test("devolve o SVG e pede o endereço público da música", async () => {
    const f = reply(SAMPLE);
    expect(await fetchScannable(URI, f)).toBe(SAMPLE);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(`https://scannables.scdn.co/uri/plain/svg/ffffff/black/640/${URI}`);
  });

  test("música que o Spotify não acha (404 ou 400): mensagem de link errado", async () => {
    for (const status of [404, 400]) {
      const e = await reason(fetchScannable(URI, reply("nope", status)));
      expect(e).toBeInstanceOf(ScannableError);
      expect(e).toMatchObject({ reason: "not-found" });
      expect(e.message).toMatch(/não achou essa música/);
    }
  });

  test("serviço fora do ar (500) ou resposta que não é o código: mensagem de serviço não oficial", async () => {
    expect(await reason(fetchScannable(URI, reply("erro", 500)))).toMatchObject({ reason: "unexpected" });
    const e = await reason(fetchScannable(URI, reply("<html>mudou</html>")));
    expect(e).toMatchObject({ reason: "unexpected" });
    expect(e.message).toMatch(/não é oficial/);
  });

  test("sem internet: mensagem clara", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const e = await reason(fetchScannable(URI, down));
    expect(e).toMatchObject({ reason: "offline" });
    expect(e.message).toMatch(/sem internet/);
  });

  test("demorou demais: cancela e conta como sem internet", async () => {
    vi.useFakeTimers();
    const hang = vi.fn((_u: unknown, init?: RequestInit) => new Promise((_ok, fail) => init?.signal?.addEventListener("abort", () => fail(new DOMException("abort", "AbortError"))))) as unknown as typeof fetch;
    const p = reason(fetchScannable(URI, hang));
    await vi.advanceTimersByTimeAsync(8500);
    expect(await p).toMatchObject({ reason: "offline" });
  });
});
