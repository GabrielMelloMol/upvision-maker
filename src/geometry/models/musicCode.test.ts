import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { buildCode, checkScannable, luminance, MIN_BAR_MM, qrShape, scannableUrl, spotifyShape, spotifyUri, type CodeInput } from "./musicCode";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** SVG de exemplo do endereço público do Spotify (salvo, para o teste não depender da internet). */
const SAMPLE = readFileSync("tests/fixtures/spotify/scannable-track.svg", "utf8");
const URI = "spotify:track:11dFghVXANMlKmJXsNCbNl";
const LINK = "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl";
const input = (extra: Partial<CodeInput> = {}): CodeInput => ({ code: "spotify", link: LINK, svg: SAMPLE, svgUri: URI, logo: true, ...extra });

describe("link ou código do Spotify → URI", () => {
  test.each([
    [LINK, URI],
    [`${LINK}?si=abc123def456`, URI],
    ["https://open.spotify.com/intl-pt/track/11dFghVXANMlKmJXsNCbNl?si=x", URI],
    ["open.spotify.com/embed/track/11dFghVXANMlKmJXsNCbNl", URI],
    ["  spotify:track:11dFghVXANMlKmJXsNCbNl  ", URI],
    ["https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3", "spotify:album:1DFixLWuPkv3KT3TnV35m3"],
    ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"],
    ["https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5", "spotify:episode:7makk4oTQel546B0PZlDM5"],
  ])("%s", (raw, uri) => expect(spotifyUri(raw)).toBe(uri));

  test.each(["", "youtube.com/watch?v=abc", "https://spotify.link/AbCdEf", "https://open.spotify.com/track/curto", "spotify:track:curto", "spotify:user:11dFghVXANMlKmJXsNCbNl", "https://evil.com/open.spotify.com/track/11dFghVXANMlKmJXsNCbNl", "não é link"])("%s não é música do Spotify", (raw) => expect(spotifyUri(raw)).toBeNull());

  test("o endereço do código usa o URI e o tamanho 640", () => {
    expect(scannableUrl(URI)).toBe("https://scannables.scdn.co/uri/plain/svg/ffffff/black/640/spotify:track:11dFghVXANMlKmJXsNCbNl");
  });
});

describe("SVG do código do Spotify", () => {
  test("o exemplo salvo é reconhecido: viewBox 400 × 100 e 23 barras com cantos redondos", () => {
    expect(checkScannable(SAMPLE)).toMatchObject({ vbW: 400, vbH: 100, bars: 23 });
    expect(checkScannable(SAMPLE)!.barW).toBeCloseTo(6.71, 2);
  });

  test.each([
    ["vazio", ""],
    ["página de erro", "<html><body>404</body></html>"],
    ["SVG sem barras", '<svg viewBox="0 0 400 100"><rect x="0" y="0" width="400" height="100"/></svg>'],
    ["SVG sem viewBox", SAMPLE.replace(/viewBox="[^"]*"/, "")],
    ["grande demais", `<svg viewBox="0 0 1 1">${" ".repeat(50_000)}</svg>`],
  ])("recusa: %s", (_n, svg) => expect(checkScannable(svg)).toBeNull());

  test("as barras viram região 2D na largura pedida, centradas, com o lado de cima para cima", () => {
    const s = spotifyShape(M, SAMPLE, false, 60);
    const b = s.cs.bounds();
    expect(b.max[0] - b.min[0]).toBeCloseTo(60, 3);
    expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(0, 3);
    expect((b.min[1] + b.max[1]) / 2).toBeCloseTo(0, 3);
    expect(s.h).toBeCloseTo((60 * 60) / 280, 2); // a barra mais alta tem 60 de 280 unidades
    expect(s.featureMm).toBeCloseTo((6.71 * 60) / 280, 3);
    expect(s.cs.area()).toBeGreaterThan(0);
    s.cs.delete();
  });

  test("com o logo: as 23 barras mais o logo (disco com os arcos vazados), e o logo faz a escala diminuir", () => {
    const withLogo = spotifyShape(M, SAMPLE, true, 60);
    const bars = spotifyShape(M, SAMPLE, false, 60);
    expect(withLogo.logo).toBe(true);
    expect(bars.logo).toBe(false);
    expect(withLogo.featureMm).toBeLessThan(bars.featureMm); // mesma largura (60 mm) para mais coisa: barras mais finas
    expect(bars.cs.decompose()).toHaveLength(23);
    expect(withLogo.cs.decompose()).toHaveLength(24);
    // o logo é um disco com 3 arcos vazados: tem buracos
    const logoOnly = withLogo.cs.decompose().sort((a, b) => b.area() - a.area())[0];
    expect(logoOnly.toPolygons().length).toBeGreaterThan(1);
    withLogo.cs.delete();
    bars.cs.delete();
  });

  test("logo ilegível não derruba: sai só com as barras e o aviso", () => {
    const broken = SAMPLE.replace(/ d="M[^"]*"/, ' d="M0 0 A5 5 0 0 1 10 10"'); // arco: comando que o app não lê
    const r = buildCode(M, input({ svg: broken }), 77);
    expect(r.shape!.logo).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/Não consegui desenhar o logo/);
    r.shape!.cs.delete();
  });

  test("SVG inválido guardado não derruba: erro claro", () => {
    expect(() => spotifyShape(M, "<svg/>", true, 60)).toThrow(/busque de novo/);
  });
});

describe("QR do link", () => {
  test("o QR do link da música tem módulos quadrados, centrado, na largura pedida", () => {
    const s = qrShape(M, LINK, 44);
    const b = s.cs.bounds();
    expect(b.max[0] - b.min[0]).toBeCloseTo(44, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(44, 1);
    expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(0, 1);
    expect(s.modules).toBe(33); // versão 4
    expect(s.featureMm).toBeCloseTo(44 / 33, 3);
    s.cs.delete();
  });

  test("link sem http é aceito (youtu.be/abc vira https) e link inválido recusa", () => {
    const ok = qrShape(M, "youtu.be/dQw4w9WgXcQ", 40);
    expect(ok.cs.area()).toBeGreaterThan(0);
    ok.cs.delete();
    expect(() => qrShape(M, "isso não é link", 40)).toThrow(/não parece um link/);
  });
});

describe("o código que o cartão desenha", () => {
  test("sem código ou sem link: nada e sem aviso", () => {
    expect(buildCode(M, input({ code: "none" }), 60)).toEqual({ shape: null, kind: null, warnings: [] });
    expect(buildCode(M, input({ link: "  " }), 60)).toEqual({ shape: null, kind: null, warnings: [] });
  });

  test("Spotify com o código guardado da música do link: usa as barras, sem aviso", () => {
    const r = buildCode(M, input(), 77);
    expect(r.kind).toBe("spotify");
    expect(r.warnings).toEqual([]);
    r.shape!.cs.delete();
  });

  test("Spotify sem o código guardado: volta ao QR do mesmo link e avisa para buscar", () => {
    const r = buildCode(M, input({ svg: "", svgUri: "" }), 60);
    expect(r.kind).toBe("qr");
    expect(r.warnings.join(" ")).toMatch(/Falta buscar o código do Spotify/);
    r.shape!.cs.delete();
  });

  test("código guardado de outra música não vale: QR e aviso", () => {
    const r = buildCode(M, input({ link: "https://open.spotify.com/track/7makk4oTQel546B0PZlDM5" }), 60);
    expect(r.kind).toBe("qr");
    expect(r.warnings.join(" ")).toMatch(/Falta buscar/);
    r.shape!.cs.delete();
  });

  test("Spotify com um link que não é do Spotify: QR do link e aviso claro", () => {
    const r = buildCode(M, input({ link: "https://youtu.be/dQw4w9WgXcQ" }), 60);
    expect(r.kind).toBe("qr");
    expect(r.warnings.join(" ")).toMatch(/Não achei uma música do Spotify/);
    r.shape!.cs.delete();
  });

  test("barras finas demais avisam; módulo de QR pequeno demais também", () => {
    const thin = buildCode(M, input(), 30);
    expect(thin.shape!.featureMm).toBeLessThan(MIN_BAR_MM);
    expect(thin.warnings.join(" ")).toMatch(/barras do código do Spotify ficaram com/);
    thin.shape!.cs.delete();
    const small = buildCode(M, input({ code: "qr" }), 30);
    expect(small.warnings.join(" ")).toMatch(/módulo do QR ficou com/);
    small.shape!.cs.delete();
  });

  test("link que não dá QR: sem código e com o motivo", () => {
    const r = buildCode(M, input({ code: "qr", link: "texto solto" }), 40);
    expect(r.shape).toBeNull();
    expect(r.warnings.join(" ")).toMatch(/não parece um link/);
  });
});

test("luminância: branco 1, preto 0, escuro < claro; cor ruim vira meio-termo", () => {
  expect(luminance("#ffffff")).toBeCloseTo(1, 3);
  expect(luminance("#000000")).toBeCloseTo(0, 3);
  expect(luminance("#1f2937")).toBeLessThan(luminance("#f5f1e6"));
  expect(luminance("azul")).toBe(0.5);
});
