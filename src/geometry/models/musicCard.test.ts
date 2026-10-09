import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds, modelsBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import type { ModelCtx } from "./common";
import { MissingInput } from "./common";
import { buildMusicCard, codeWidthMm, DEFAULT_MUSIC_CARD as D, type MusicCardParams } from "./musicCard";
import { testQrReading } from "./musicCodeTest";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** "Fonte" de teste: o texto vira um bloco 0,5·h × h por letra. */
const ctx = (art: ModelCtx["art"] = null, layers: ModelCtx["artLayers"] = null): ModelCtx => ({ M, art, artLayers: layers, text: (s, h) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null) });
const build = (p: Partial<MusicCardParams> = {}, c: ModelCtx = ctx()) => buildMusicCard(c, { ...D, ...p });
const part = (out: ReturnType<typeof build>, name: string) => out.models[0].parts.find((x) => x.name === name)?.mesh;
const width = (m: NonNullable<ReturnType<typeof part>>) => { const b = meshBounds([m])!; return [b.max[0] - b.min[0], b.max[1] - b.min[1]]; };

describe("cartão de música (#112)", { timeout: 60_000 }, () => {
  test("placa na largura pedida, na mesa; textos e destaque em relevo sobre ela", () => {
    const out = build({ mount: "none" });
    const plate = meshBounds([part(out, "Placa")!])!;
    expect(plate.max[0] - plate.min[0]).toBeCloseTo(D.width, 1);
    expect(plate.min[2]).toBeCloseTo(0);
    expect(plate.max[2]).toBeCloseTo(D.thickness);
    for (const name of ["Texto", "Destaque"]) {
      const b = meshBounds([part(out, name)!])!;
      expect(b.min[2]).toBeCloseTo(D.thickness);
      expect(b.max[2]).toBeCloseTo(D.thickness + D.relief);
    }
    const all = modelsBounds(out.models)!;
    expect(all.max[2]).toBeCloseTo(D.thickness + D.relief);
  });

  test("tudo cabe dentro da placa", () => {
    const out = build({ line3: "uma terceira linha", line4: "e a quarta", mount: "none" });
    const plate = meshBounds([part(out, "Placa")!])!;
    for (const name of ["Texto", "Destaque"]) {
      const b = meshBounds([part(out, name)!])!;
      expect(b.min[0]).toBeGreaterThanOrEqual(plate.min[0] + 1);
      expect(b.max[0]).toBeLessThanOrEqual(plate.max[0] - 1);
      expect(b.min[1]).toBeGreaterThanOrEqual(plate.min[1] + 1);
      expect(b.max[1]).toBeLessThanOrEqual(plate.max[1] - 1);
    }
  });

  test("mais linhas de letra deixam a placa mais alta; sem botões fica mais baixa", () => {
    const h = (p: Partial<MusicCardParams>) => width(part(build({ mount: "none", ...p }), "Placa")!)[1];
    expect(h({ line3: "x", line4: "y" })).toBeGreaterThan(h({}) + 5);
    expect(h({ showButtons: false })).toBeLessThan(h({}) - 5);
  });

  test("o progresso move o fim do trecho tocado", () => {
    const right = (progress: number) => meshBounds([part(build({ progress, showButtons: false, mount: "none" }), "Destaque")!])!.max[0];
    expect(right(80)).toBeGreaterThan(right(20) + 0.5 * D.width * (1 - 0.14) * 0.5);
  });

  test("foto enviada ocupa um quadrado da largura útil; colorida vira uma parte por cor", () => {
    const art = M.CrossSection.square([30, 30], true);
    const layers = [{ color: "#ff0000", cs: M.CrossSection.square([30, 15], false).translate([-15, -15]) }, { color: "#0000ff", cs: M.CrossSection.square([30, 15], false).translate([-15, 0]) }];
    const out = build({ mount: "none" }, ctx(art, layers));
    const fotos = out.models[0].parts.filter((x) => x.name.startsWith("Foto"));
    expect(fotos).toHaveLength(2);
    const b = meshBounds(fotos.map((f) => f.mesh))!;
    const side = D.width * (1 - 2 * 0.07);
    expect(b.max[0] - b.min[0]).toBeCloseTo(side, 1);
    expect(b.max[1] - b.min[1]).toBeCloseTo(side, 1);
    expect(new Set(fotos.map((f) => f.color)).size).toBe(2);
    const without = build({ mount: "none" });
    expect(width(part(out, "Placa")!)[1]).toBeGreaterThan(width(part(without, "Placa")!)[1] + side - 1);
  });

  test("suporte acrescenta o modelo do suporte; ímã tira o volume do bolso e avisa a espessura mínima", () => {
    expect(build({ mount: "stand" }).models).toHaveLength(2);
    expect(build({ mount: "none" }).models).toHaveLength(1);
    const plain = volume(part(build({ mount: "none", thickness: 4 }), "Placa")!);
    const magnet = build({ mount: "magnet", thickness: 4 });
    const pocket = Math.PI * 5.1 * 5.1 * 2;
    expect(plain - volume(part(magnet, "Placa")!)).toBeCloseTo(pocket, -1);
    expect(magnet.warnings!.join(" ")).toMatch(/ímã de 10 mm/);
    expect(build({ mount: "magnet", thickness: 3 }).warnings!.join(" ")).toMatch(/espessura de 3.2 mm ou mais/);
  });

  test("sem título, artista nem foto: pede dados; elementos movíveis listados", () => {
    expect(() => build({ title: "", artist: "" })).toThrow(MissingInput);
    const ids = build().elements!.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["title", "artist", "lyric1", "bar", "progress", "timeStart", "timeEnd", "buttons"]));
  });
});

describe("código para chegar à música (QR e Spotify)", { timeout: 60_000 }, () => {
  const SAMPLE = readFileSync("tests/fixtures/spotify/scannable-track.svg", "utf8");
  const LINK = "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl";
  const SPOTIFY = { code: "spotify" as const, codeLink: LINK, spotifySvg: SAMPLE, spotifyUri: "spotify:track:11dFghVXANMlKmJXsNCbNl" };
  const bounds = (out: ReturnType<typeof build>, name: string) => meshBounds([part(out, name)!])!;

  test("padrão: sem link não há código e o cartão é o de antes", () => {
    const out = build({ mount: "none" });
    expect(part(out, "Código")).toBeUndefined();
    expect(out.elements!.map((e) => e.id)).not.toContain("code");
  });

  test("QR do link: peça à parte, em relevo, quadrada, centrada, do tamanho pedido e abaixo dos botões", () => {
    const out = build({ mount: "none", code: "qr", codeLink: LINK, codeSize: 44 });
    const b = bounds(out, "Código");
    expect(b.min[2]).toBeCloseTo(D.thickness);
    expect(b.max[2]).toBeCloseTo(D.thickness + D.relief);
    expect(b.max[0] - b.min[0]).toBeCloseTo(44, 0);
    expect(b.max[1] - b.min[1]).toBeCloseTo(44, 0);
    expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(0, 0);
    expect(b.max[1]).toBeLessThan(bounds(out, "Destaque").min[1] + 0.01); // abaixo dos botões (o destaque inclui o "tocar")
    expect(out.elements!.find((e) => e.id === "code")).toBeTruthy();
    expect(out.warnings!.join(" ")).not.toMatch(/Falta buscar/);
  });

  test("o código aumenta a altura do cartão e a placa continua cobrindo tudo", () => {
    const without = build({ mount: "none" });
    const withCode = build({ mount: "none", code: "qr", codeLink: LINK, codeSize: 44 });
    const [h0, h1] = [bounds(without, "Placa"), bounds(withCode, "Placa")].map((b) => b.max[1] - b.min[1]);
    expect(h1 - h0).toBeCloseTo(44 + D.width * 0.04, 0); // o bloco e o espaço entre blocos
    const plate = bounds(withCode, "Placa");
    const c = bounds(withCode, "Código");
    expect(c.min[1]).toBeGreaterThan(plate.min[1]);
    expect(c.max[0]).toBeLessThan(plate.max[0]);
  });

  test("a largura do código nunca passa da largura útil da placa", () => {
    expect(codeWidthMm({ width: 80, codeSize: 100 })).toBeCloseTo(80 * 0.86, 5);
    expect(codeWidthMm({ width: 110, codeSize: 44 })).toBe(44);
  });

  test("o QR do cartão lê de cima o mesmo link (leitor do app)", () => {
    expect(testQrReading(M, LINK, 44)).toEqual({ ok: true, read: LINK });
    expect(testQrReading(M, "youtu.be/dQw4w9WgXcQ", 44).read).toBe("https://youtu.be/dQw4w9WgXcQ");
  });

  test("módulo pequeno demais deixa de ler e o cartão avisa", () => {
    const out = build({ mount: "none", code: "qr", codeLink: LINK, codeSize: 30 });
    expect(out.warnings!.join(" ")).toMatch(/módulo do QR ficou com/);
  });

  test("código do Spotify guardado: barras e logo em relevo, na cor do código, sem cair para o QR", () => {
    const out = build({ mount: "none", ...SPOTIFY, codeSize: 70 });
    const b = bounds(out, "Código");
    expect(b.max[0] - b.min[0]).toBeCloseTo(70, 0);
    expect(b.max[1] - b.min[1]).toBeCloseTo((70 * 60) / 360, 0); // a barra mais alta tem 60 de 360 unidades (com o logo)
    expect(b.min[2]).toBeCloseTo(D.thickness);
    expect(out.warnings!.join(" ")).not.toMatch(/QR|Falta buscar/);
    // o aviso de marca fica na tela do campo, pequeno; o arquivo não leva alerta
    expect(out.warnings!.join(" ")).not.toMatch(/marca/);
  });

  test("Spotify sem o código buscado: cai para o QR do mesmo link e avisa para buscar", () => {
    const out = build({ mount: "none", ...SPOTIFY, spotifySvg: "", spotifyUri: "", codeSize: 44 });
    expect(out.warnings!.join(" ")).toMatch(/Falta buscar o código do Spotify/);
    const b = bounds(out, "Código");
    expect(b.max[1] - b.min[1]).toBeCloseTo(44, 0); // quadrado: é o QR
  });

  test("sem o logo as barras ficam mais grossas na mesma largura", () => {
    const logo = build({ mount: "none", ...SPOTIFY, codeSize: 64 });
    const bars = build({ mount: "none", ...SPOTIFY, spotifyLogo: false, codeSize: 64 });
    const hLogo = bounds(logo, "Código"), hBars = bounds(bars, "Código");
    expect(hBars.max[1] - hBars.min[1]).toBeGreaterThan(hLogo.max[1] - hLogo.min[1]);
    expect(volume(part(bars, "Código")!)).toBeGreaterThan(0);
  });

  test("QR claro sobre placa escura avisa; escuro sobre claro, não", () => {
    expect(build({ mount: "none", code: "qr", codeLink: LINK, plateColor: "#1f2937", codeColor: "#f5f1e6" }).warnings!.join(" ")).toMatch(/QR lê melhor escuro sobre placa clara/);
    expect(build({ mount: "none", code: "qr", codeLink: LINK }).warnings!.join(" ")).not.toMatch(/QR lê melhor/);
  });

  test("cartão alto demais com o código avisa que não cabe na mesa", () => {
    const art = M.CrossSection.square([10, 10], true); // com foto quadrada, letra de 4 linhas e o código largo
    const out = build({ mount: "none", code: "qr", codeLink: LINK, codeSize: 100, width: 110, line3: "a", line4: "b" }, ctx(art));
    expect(out.warnings!.join(" ")).toMatch(/não cabe na mesa/);
    expect(build({ mount: "none", code: "qr", codeLink: LINK }, ctx(art)).warnings!.join(" ")).not.toMatch(/não cabe na mesa/);
  });

  test("código escolhido e link vazio ou 'Nenhum': nada desenhado", () => {
    expect(part(build({ code: "qr", codeLink: "" }), "Código")).toBeUndefined();
    expect(part(build({ code: "none", codeLink: LINK }), "Código")).toBeUndefined();
  });
});
