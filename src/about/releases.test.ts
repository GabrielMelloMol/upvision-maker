import { describe, expect, test, vi } from "vitest";
import { fetchReleases, parseReleases, releaseHighlights, versionsBehind, type Release } from "./releases";

const rel = (tag: string, extra: Partial<{ draft: boolean; prerelease: boolean; body: string; name: string; published_at: string }> = {}) => ({
  tag_name: tag,
  name: extra.name ?? `UpVision Maker ${tag}`,
  draft: extra.draft ?? false,
  prerelease: extra.prerelease ?? false,
  body: extra.body ?? "",
  published_at: extra.published_at ?? "2026-10-01T00:00:00Z",
  html_url: `https://github.com/x/releases/tag/${tag}`,
});

describe("parseReleases", () => {
  test("ignora rascunho, pré-lançamento e tag fora do padrão; tira o 'v'; ordena da mais nova", () => {
    const r = parseReleases([rel("v0.3.0"), rel("v0.10.0"), rel("v0.9.0"), rel("v0.11.0", { draft: true }), rel("v0.12.0-beta", { prerelease: true }), rel("nightly")]);
    expect(r.map((x) => x.version)).toEqual(["0.10.0", "0.9.0", "0.3.0"]);
  });
  test("resposta que não é lista vira lista vazia", () => {
    expect(parseReleases({ message: "API rate limit exceeded" })).toEqual([]);
  });
});

describe("versionsBehind", () => {
  const list: Release[] = parseReleases([rel("v0.5.0"), rel("v0.4.0"), rel("v0.3.0"), rel("v0.2.0")]);
  test("conta as versões publicadas depois da instalada (0.10 > 0.9 no semver)", () => {
    expect(versionsBehind("0.3.0", list)).toMatchObject({ latest: "0.5.0", count: 2 });
    expect(versionsBehind("0.3.0", list).missing.map((r) => r.version)).toEqual(["0.5.0", "0.4.0"]);
    expect(versionsBehind("0.9.0", parseReleases([rel("v0.10.0")]))).toMatchObject({ count: 1, latest: "0.10.0" });
  });
  test("em dia ou à frente (versão de desenvolvimento) = 0", () => {
    expect(versionsBehind("0.5.0", list).count).toBe(0);
    expect(versionsBehind("0.6.0", list).count).toBe(0);
    expect(versionsBehind("0.5.0", []).latest).toBeNull();
  });
});

describe("releaseHighlights", () => {
  test("itens do corpo em markdown, sem marcação, até 4", () => {
    const body = "## Novidades\n- **Backup automático** diário\n* Tempo `3h20`\n- [Pix](https://x) com valor\n- a\n- b\n\nTexto solto";
    expect(releaseHighlights(body)).toEqual(["Backup automático diário", "Tempo 3h20", "Pix com valor", "a"]);
    expect(releaseHighlights("")).toEqual([]);
  });
});

describe("fetchReleases", () => {
  test("chama a API pública de releases e devolve as publicadas", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([rel("v0.4.0"), rel("v0.5.0", { draft: true })]), { status: 200 }));
    const r = await fetchReleases(f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith(expect.stringContaining("api.github.com/repos/GabrielMelloMol/upvision-maker/releases"), expect.anything());
    expect(r.map((x) => x.version)).toEqual(["0.4.0"]);
  });
  test("limite de uso / erro HTTP / sem internet lançam erro com mensagem em português", async () => {
    await expect(fetchReleases((async () => new Response("{}", { status: 403 })) as unknown as typeof fetch)).rejects.toThrow("GitHub");
    await expect(
      fetchReleases((async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch),
    ).rejects.toThrow("internet");
  });
});
