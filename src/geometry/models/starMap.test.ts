import { beforeAll, describe, expect, test } from "vitest";
import { meshBounds } from "../bounds";
import { getManifold, type ManifoldToplevel } from "../manifold";
import { volume } from "../testUtil";
import { MissingInput, type ModelCtx } from "./common";
import { buildStarMap, DEFAULT_STAR_MAP as D, hollowLayout, idealDiameter, minLineMm, minStarMm, starDiameter, starMapPlan, type StarMapParams } from "./starMap";
import { LED } from "../lithophaneLed";
import type { Mesh } from "../types";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

/** "Fonte" de teste: cada letra vira um bloco 0,5·h × h. */
const ctx = (): ModelCtx => ({ M, art: null, artLayers: null, text: (s, h) => (s.trim() ? M.CrossSection.square([0.5 * h * s.length, h], true) : null) });
const build = (p: Partial<StarMapParams> = {}) => buildStarMap(ctx(), { ...D, ...p });
const part = (out: ReturnType<typeof build>, name: string) => out.models[0].parts.find((x) => x.name === name)!.mesh;
const H = D.width * 1.3;

describe("mapa estelar de uma data (#106)", { timeout: 60_000 }, () => {
  test("placa na largura pedida e 30% mais alta para o texto; estrelas em relevo sobre ela, 2 cores", () => {
    const out = build();
    const plate = meshBounds([part(out, "Placa")])!;
    expect(plate.max[0] - plate.min[0]).toBeCloseTo(D.width, 1);
    expect(plate.max[1] - plate.min[1]).toBeCloseTo(H, 1);
    expect(plate.min[2]).toBeCloseTo(0);
    expect(plate.max[2]).toBeCloseTo(D.thickness);
    const marks = meshBounds([part(out, "Estrelas")])!;
    expect(marks.min[2]).toBeCloseTo(D.thickness);
    expect(marks.max[2]).toBeCloseTo(D.thickness + D.relief);
    expect(out.models[0].parts.map((x) => x.color)).toEqual([D.plateColor, D.starColor]);
  });

  test("volume da placa: retângulo arredondado × espessura (suporte de mesa, sem ímã)", () => {
    const r = D.width * 0.05;
    expect(volume(part(build(), "Placa"))).toBeCloseTo((D.width * H - (4 - Math.PI) * r * r) * D.thickness, -2);
  });

  test("o céu cabe no círculo do aro, em cima, centrado na largura; o aro fecha a 1 mm", () => {
    const b = meshBounds([part(build({ title: "" }), "Estrelas")])!;
    const R = D.width / 2 - 6;
    expect(b.max[0]).toBeCloseTo(R + 1, 1); // o aro
    expect(b.min[0]).toBeCloseTo(-(R + 1), 1);
    const cy = H / 2 - D.width / 2;
    expect(b.max[1]).toBeCloseTo(cy + R + 1, 1);
    expect(b.min[1]).toBeGreaterThanOrEqual(-H / 2); // a legenda com a data fica abaixo do céu, dentro da placa
    expect(b.min[1]).toBeLessThan(cy - R - 1);
  });

  test("diâmetro da estrela por magnitude: as brilhantes são maiores e nenhuma passa de menor que 1,5 bico (0,6 mm com bico 0,4)", () => {
    const min = minStarMm(0.4, false);
    expect(min).toBeCloseTo(0.6, 9);
    expect(starDiameter(-1.46, 4.5, 1, min)).toBeCloseTo(0.6 + 5.96 * 0.55, 6);
    expect(starDiameter(4.5, 4.5, 1, min)).toBeCloseTo(0.6, 9); // a do limite vale o mínimo
    expect(starDiameter(4.5, 4.5, 0.7, min)).toBeCloseTo(0.6, 9); // o mínimo vale mesmo com a escala menor
    expect(idealDiameter(4.5, 4.5, 0.7, min)).toBeCloseTo(0.42, 9); // o ideal fica abaixo: é "pequena demais"
    expect(minStarMm(0.6, false)).toBeCloseTo(0.9, 9); // vale para qualquer bico
    expect(minStarMm(0.4, true)).toBeCloseTo(0.8, 9); // furo (vazada): 2 bicos
    expect(minLineMm(0.4)).toBeCloseTo(0.8, 9); // linha: 2 bicos
    expect(minLineMm(0.6)).toBeCloseTo(1.2, 9);
  });

  test("limite de magnitude automático pelo tamanho da placa: placa pequena mostra só as mais brilhantes", () => {
    const small = starMapPlan({ ...D, width: 80 }), normal = starMapPlan(D), big = starMapPlan({ ...D, width: 180 });
    expect(small.stars.length).toBeLessThan(normal.stars.length);
    expect(normal.stars.length).toBeLessThan(big.stars.length);
    expect(small.limit).toBeLessThan(normal.limit);
    expect(normal.limit).toBeLessThan(big.limit);
    expect(normal.limit).toBeCloseTo(4.5, 0); // a placa padrão de 120 mm continua com ~480 estrelas
    expect(normal.stars.length).toBeGreaterThan(440);
    expect(normal.stars.length).toBeLessThan(520);
    for (const plan of [small, normal, big]) expect(plan.stars.length).toBeLessThanOrEqual(plan.allowed);
  });

  test("Quantidade de estrelas (poucas, normal, muitas) e bico maior pedem menos estrelas", () => {
    const n = (p: Partial<StarMapParams>) => starMapPlan({ ...D, ...p }).stars.length;
    expect(n({ density: "few" })).toBeLessThan(n({ density: "normal" }));
    expect(n({ density: "normal" })).toBeLessThan(n({ density: "many" }));
    expect(n({ nozzle: 0.6 })).toBeLessThan(n({ nozzle: 0.4 })); // bico mais grosso: menos estrelas, para caberem
    expect(n({ nozzle: 0.2 })).toBeGreaterThan(n({ nozzle: 0.4 }));
  });

  test("nenhuma estrela abaixo do mínimo, em nenhuma placa, bico, quantidade ou escala; as que ficariam pequenas são contadas", () => {
    for (const width of [80, 120, 180]) for (const nozzle of [0.2, 0.4, 0.6, 0.8]) for (const density of ["few", "normal", "many"] as const) for (const starScale of [0.7, 1, 1.6]) for (const hollow of [false, true]) {
      const plan = starMapPlan({ ...D, width, nozzle, density, starScale, hollow });
      const min = minStarMm(nozzle, hollow);
      expect(Math.min(...plan.stars.map((s) => s.d)), `${width}/${nozzle}/${density}/${starScale}/${hollow}`).toBeGreaterThanOrEqual(min - 1e-9);
      expect(plan.stars.filter((s) => s.ideal < min - 1e-9).length).toBe(plan.tooSmall);
      expect(plan.lineMm).toBeCloseTo(2 * nozzle, 9);
    }
    expect(starMapPlan({ ...D, starScale: 1 }).tooSmall).toBe(0); // na escala normal só a do limite chega exatamente ao mínimo
    expect(starMapPlan({ ...D, starScale: 0.7 }).tooSmall).toBeGreaterThan(50);
  });

  test("bico de 0,2 a 0,8 mm (vem do seletor como texto): mínimo 1,5 bico, linha 2 bicos, e o bico fino deixa mais estrelas", () => {
    for (const [nozzle, star, line] of [["0.2", 0.3, 0.4], ["0.4", 0.6, 0.8], ["0.6", 0.9, 1.2], ["0.8", 1.2, 1.6]] as const) {
      const plan = starMapPlan({ ...D, nozzle });
      expect(plan.nozzle, nozzle).toBe(Number(nozzle));
      expect(plan.minStar, nozzle).toBeCloseTo(star, 9);
      expect(plan.lineMm, nozzle).toBeCloseTo(line, 9);
      expect(Math.min(...plan.stars.map((s) => s.d)), nozzle).toBeGreaterThanOrEqual(star - 1e-9);
    }
    const counts = ["0.2", "0.4", "0.6", "0.8"].map((nozzle) => starMapPlan({ ...D, nozzle }).stars.length);
    expect(counts[0]).toBeGreaterThan(counts[1]); // 0,2: mais estrelas (até o que o catálogo tem)
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(counts[3]);
    expect(starMapPlan({ ...D, nozzle: "0.4" }).stars.length).toBe(starMapPlan(D).stars.length); // texto e número dão o mesmo
    expect(starMapPlan({ ...D, nozzle: "lixo" }).nozzle).toBe(0.4); // valor inválido de um rascunho velho cai no padrão
    expect(D.nozzle).toBe(0.4);
  });

  test("a peça usa os diâmetros do plano: o menor furo ou estrela impresso é o do plano, e o aviso conta as engrossadas", () => {
    const out = build({ starScale: 0.7 });
    const plan = starMapPlan({ ...D, starScale: 0.7 });
    expect(out.warnings!.join(" ")).toContain(`${plan.tooSmall} de ${plan.stars.length} estrelas ficariam menores que 0,60 mm`);
    expect(build().warnings!.join(" ")).not.toMatch(/ficariam menores/);
    expect(out.warnings![0]).toMatch(/\d+ estrelas \(até a magnitude 4\.\d, automático pelo tamanho da placa\)/);
  });

  test("as linhas das constelações não ficam mais finas que 2 bicos (volume das linhas cresce com o bico)", () => {
    const lines = (nozzle: number) => volume(part(build({ nozzle, density: "few" }), "Estrelas")) - volume(part(build({ nozzle, density: "few", lines: false }), "Estrelas"));
    expect(lines(0.6)).toBeGreaterThan(lines(0.4) * 1.2);
  });

  test("outro lugar ou outra hora muda o céu; quantidade 'muitas' pesa mais que 'poucas'", () => {
    const base = volume(part(build(), "Estrelas"));
    expect(volume(part(build({ city: "londres", utcOffset: 0 }), "Estrelas"))).not.toBeCloseTo(base, 0);
    expect(volume(part(build({ hour: 4 }), "Estrelas"))).not.toBeCloseTo(base, 0);
    expect(volume(part(build({ density: "many" }), "Estrelas"))).toBeGreaterThan(volume(part(build({ density: "few" }), "Estrelas")));
  });

  test("linhas das constelações: ligadas por padrão, em relevo fino; desligar tira só as linhas", () => {
    const on = volume(part(build(), "Estrelas"));
    const off = volume(part(build({ lines: false }), "Estrelas"));
    expect(D.lines).toBe(true);
    expect(on).toBeGreaterThan(off + 20); // centenas de trechos de 0,8 mm × 0,8 mm de relevo
    expect(volume(part(build(), "Placa"))).toBeCloseTo(volume(part(build({ lines: false }), "Placa")), 6);
    const b = meshBounds([part(build({ title: "" }), "Estrelas")])!;
    expect(b.max[0]).toBeCloseTo(D.width / 2 - 6 + 1, 1); // as linhas não passam do aro
    expect(meshBounds([part(build(), "Estrelas")])!.max[2]).toBeCloseTo(D.thickness + D.relief);
  });

  test("coordenadas livres valem só no lugar buscado (\"custom\"); a cidade da lista de um rascunho antigo vence", () => {
    const sp = volume(part(build({ city: "saopaulo" }), "Estrelas"));
    expect(volume(part(build({ city: "saopaulo", lat: 60, lon: 10 }), "Estrelas"))).toBeCloseTo(sp, 6); // cidade escolhida vence
    expect(volume(part(build({ city: "custom", lat: 60, lon: 10 }), "Estrelas"))).not.toBeCloseTo(sp, 0);
  });

  test("apoio: suporte de mesa vira outro modelo; ímã fura a placa e avisa", () => {
    expect(build({ mount: "stand" }).models.map((m) => m.name)).toEqual(["Mapa estelar", "Suporte"]);
    const mag = build({ mount: "magnet", thickness: 4 });
    expect(mag.models).toHaveLength(1);
    expect(volume(part(build({ mount: "none", thickness: 4 }), "Placa")) - volume(part(mag, "Placa"))).toBeCloseTo(Math.PI * 5.1 ** 2 * 2, -1);
    expect(mag.warnings?.join(" ")).toMatch(/ímã de 10 mm por 2 mm/);
    expect(build({ mount: "magnet", thickness: 3 }).warnings?.join(" ")).toMatch(/use espessura de 3.2 mm ou mais/);
  });

  test("data que não existe pede correção; 29 de fevereiro vale em ano bissexto", () => {
    expect(() => build({ month: 2, day: 30 })).toThrow(MissingInput);
    expect(() => build({ month: 4, day: 31 })).toThrow(MissingInput);
    expect(() => build({ month: 2, day: 29, year: 2023 })).toThrow(MissingInput);
    expect(() => build({ month: 2, day: 29, year: 2024 })).not.toThrow();
    expect(() => build({ month: 2, day: 29, year: 1900 })).toThrow(MissingInput); // 1900 não foi bissexto
  });

  test("avisa quantas estrelas aparecem e o fuso usado", () => {
    const w = build().warnings![0];
    expect(w).toMatch(/\d+ estrelas \(até a magnitude 4\.5, automático pelo tamanho da placa\) no céu de São Paulo/);
    expect(w).toMatch(/fuso UTC−3 \(automático/);
  });
  describe("lugar por busca e fuso automático (#196)", () => {
    const stars = (p: Partial<StarMapParams>) => part(build({ title: "", ...p }), "Estrelas");
    const SP = { city: "custom", lat: -23.55, lon: -46.63, placeName: "São Paulo, SP", tz: "America/Sao_Paulo" };
    const JAN_2010 = { year: 2010, month: 1, day: 15, hour: 22, minute: 0 };

    test("fuso automático: São Paulo em 15/01/2010 22:00 calcula o céu com UTC−2 e em julho com UTC−3", () => {
      const auto = stars({ ...SP, ...JAN_2010, tzAuto: true, utcOffset: -3 });
      expect(Array.from(auto.positions)).toEqual(Array.from(stars({ ...SP, ...JAN_2010, tzAuto: false, utcOffset: -2 }).positions));
      expect(Array.from(auto.positions)).not.toEqual(Array.from(stars({ ...SP, ...JAN_2010, tzAuto: false, utcOffset: -3 }).positions));
      const july = stars({ ...SP, ...JAN_2010, month: 7, tzAuto: true, utcOffset: -2 });
      expect(Array.from(july.positions)).toEqual(Array.from(stars({ ...SP, ...JAN_2010, month: 7, tzAuto: false, utcOffset: -3 }).positions));
    });

    test("com o fuso automático desligado vale o fuso digitado", () => {
      const manual = stars({ ...SP, ...JAN_2010, tzAuto: false, utcOffset: 5 });
      expect(Array.from(manual.positions)).not.toEqual(Array.from(stars({ ...SP, ...JAN_2010, tzAuto: true }).positions));
    });

    test("lugar escolhido na busca (cidade do interior) dá o mesmo céu que latitude e longitude digitadas", () => {
      const rita = { lat: -21.7087, lon: -47.4782 };
      const byName = stars({ city: "custom", ...rita, placeName: "Santa Rita do Passa Quatro, SP", tz: "", tzAuto: true, caption: "x", ...JAN_2010 });
      const byHand = stars({ city: "custom", ...rita, placeName: "", tz: "America/Sao_Paulo", tzAuto: false, utcOffset: -2, caption: "x", ...JAN_2010 });
      expect(Array.from(byName.positions)).toEqual(Array.from(byHand.positions));
    });

    test("o fuso do lugar vem do campo tz quando preenchido (Lisboa no verão = UTC+1)", () => {
      const a = stars({ city: "custom", lat: 38.72, lon: -9.14, placeName: "Lisboa, Portugal", tz: "Europe/Lisbon", tzAuto: true, caption: "x", year: 2024, month: 7, day: 1, hour: 22, minute: 0 });
      const b = stars({ city: "custom", lat: 38.72, lon: -9.14, tzAuto: false, utcOffset: 1, caption: "x", year: 2024, month: 7, day: 1, hour: 22, minute: 0 });
      expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    });

    test("o aviso diz o fuso usado, com o horário de verão, e a legenda usa o nome do lugar", () => {
      const out = build({ ...SP, ...JAN_2010, tzAuto: true });
      expect(out.warnings?.[0]).toContain("São Paulo, SP");
      expect(out.warnings?.[0]).toContain("UTC−2 (horário de verão)");
      expect(build({ ...SP, ...JAN_2010, year: 2024, tzAuto: true }).warnings?.[0]).toContain("UTC−3");
    });

    test("rascunho antigo (cidade da lista, sem tz nem busca) continua funcionando", () => {
      expect(() => build({ city: "belem", tzAuto: false })).not.toThrow();
      expect(build({ city: "belem" }).warnings?.[0]).toContain("Belém");
    });
  });
});

/** Malha → sólido do manifold, para cortar e medir a peça pronta nos testes. */
function solidOf(M: ManifoldToplevel, mesh: Mesh) {
  return new M.Manifold(new M.Mesh({ numProp: 3, vertProperties: new Float32Array(mesh.positions), triVerts: new Uint32Array(mesh.indices) }));
}
const holesAt = (M: ManifoldToplevel, mesh: Mesh, z: number) => {
  const cs = solidOf(M, mesh).slice(z);
  const holes = cs.toPolygons().filter((poly) => poly.reduce((a, [x, y], i) => a + (x * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * y), 0) < 0);
  return holes.map((poly) => ({ area: Math.abs(poly.reduce((a, [x, y], i) => a + (x * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * y), 0)) / 2, poly }));
};
/** Ponto dentro do polígono (par-ímpar). */
function insidePoly(poly: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const equivDiameter = (area: number) => 2 * Math.sqrt(area / Math.PI);

describe("estrelas vazadas para LED atrás", { timeout: 120_000 }, () => {
  const hollow = { hollow: true, density: "few" as const };
  const lay = hollowLayout(D);

  test("a placa vira frente de 1,2 mm + rebaixo do LED + degrau da tampa, e fica na mesa pela frente", () => {
    const out = build(hollow);
    const plate = meshBounds([part(out, "Placa")])!;
    expect(plate.min[2]).toBeCloseTo(0);
    expect(plate.max[2]).toBeCloseTo(1.2 + D.ledDepth + LED.rebate, 6);
    expect(plate.max[2]).toBeCloseTo(lay.thickness, 6);
    expect(out.models.map((m) => m.name)).toEqual(["Mapa estelar", "Tampa do LED", "Suporte"]);
    // a tampa tem a espessura e a folga da base de LED da litofania
    const lid = meshBounds([out.models[1].parts[0].mesh])!;
    expect(lid.max[2] - lid.min[2]).toBeCloseTo(LED.plateT, 6);
    expect((lid.max[0] - lid.min[0]) / 2).toBeCloseTo(lay.recessR - LED.plateClear, 1);
    expect(lay.lidT).toBeLessThan(lay.recessDepth); // a tampa fica um pouco para dentro do degrau
  });

  test("os furos atravessam a frente: cada estrela é furo na frente (z = 0,05) e atrás dela (z = 1,15), dentro do rebaixo", () => {
    const plan = starMapPlan({ ...D, ...hollow });
    const mesh = part(build(hollow), "Placa");
    const cy = (D.width * 1.3) / 2 - D.width / 2;
    for (const z of [0.05, lay.skin - 0.05]) {
      const cs = solidOf(M, mesh).slice(z).toPolygons();
      const inMaterial = (x: number, y: number) => cs.reduce((n, poly) => n + (insidePoly(poly, x, y) ? 1 : 0), 0) % 2 === 1;
      // as 150 mais brilhantes (e as mais fracas, as menores): o centro de cada uma é vazio
      const probe = [...plan.stars.slice(0, 150), ...plan.stars.slice(-60)];
      expect(probe.filter((s) => inMaterial(s.px, cy + s.py)), `z = ${z}`).toHaveLength(0);
    }
    // logo atrás da frente a peça está na vazia do rebaixo: um buraco só, do tamanho do rebaixo, que contém todas as estrelas
    const pocket = holesAt(M, mesh, lay.skin + 0.5);
    expect(pocket).toHaveLength(1);
    expect(equivDiameter(pocket[0].area) / 2).toBeCloseTo(lay.pocketR, 0);
    for (const s of plan.stars) expect(Math.hypot(s.px, s.py) + s.d / 2).toBeLessThan(lay.pocketR - 0.5);
    expect(holesAt(M, mesh, lay.skin - 0.05).length).toBeGreaterThanOrEqual(plan.stars.length * 0.8); // as muito perto uma da outra viram um furo só
  });

  test("nenhum furo menor que o mínimo (2 bicos = 0,8 mm) e nenhuma estrela do plano abaixo dele", () => {
    const plan = starMapPlan({ ...D, ...hollow });
    expect(plan.minStar).toBeCloseTo(0.8, 9);
    expect(Math.min(...plan.stars.map((s) => s.d))).toBeGreaterThanOrEqual(0.8 - 1e-9);
    const holes = holesAt(M, part(build(hollow), "Placa"), 0.05);
    const smallest = Math.min(...holes.map((h) => equivDiameter(h.area)));
    expect(smallest).toBeGreaterThanOrEqual(0.8 * 0.95); // polígono de 20 lados: ~1% menor que o círculo
  });

  test("linhas, aro e texto entram rentes na frente, em outra cor, sem tapar os furos", () => {
    const out = build(hollow);
    const marks = meshBounds([part(out, "Estrelas")])!;
    expect(marks.min[2]).toBeCloseTo(0);
    expect(marks.max[2]).toBeCloseTo(Math.min(D.relief, lay.skin - 0.4), 6);
    // as marcas não passam do aro nem enchem os furos: o volume delas é menor que o das mesmas marcas em relevo
    const relief = volume(part(build({ density: "few" }), "Estrelas"));
    expect(volume(part(out, "Estrelas"))).toBeLessThan(relief);
    expect(out.models[0].parts.map((x) => x.color)).toEqual([D.plateColor, D.starColor]);
  });

  test("a tampa é maior que o céu e menor que o degrau; tem a saída do cabo", () => {
    const lid = part({ models: build(hollow).models.slice(1), warnings: [] } as unknown as ReturnType<typeof build>, "Tampa");
    const cut = solidOf(M, lid).slice(LED.plateT / 2);
    const area = cut.area();
    expect(area).toBeLessThan(Math.PI * lay.lidR ** 2); // o recorte do cabo tira área
    expect(area).toBeGreaterThan(Math.PI * lay.lidR ** 2 - Math.PI * (LED.cableD / 2) ** 2 * 1.01);
    expect(lay.lidR).toBeGreaterThan(lay.pocketR); // cobre a abertura do rebaixo
  });

  test("avisos: imprimir com a frente para baixo e o rebaixo de LED; ímã não vale; tampa que não cabe ao lado", () => {
    const w = build({ ...hollow, mount: "magnet" }).warnings!.join(" ");
    expect(w).toMatch(/frente para baixo/);
    expect(w).toMatch(/rebaixo de trás/);
    expect(w).toMatch(/não há ímã atrás/);
    expect(build({ ...hollow, width: 180 }).warnings!.join(" ")).toMatch(/A tampa não cabe ao lado da placa/);
    expect(build({ ...hollow, width: 120 }).warnings!.join(" ")).not.toMatch(/A tampa não cabe/);
  });

  test("sem vazar, nada muda: relevo na espessura pedida e uma peça só (mais o suporte)", () => {
    const out = build({ density: "few" });
    expect(out.models.map((m) => m.name)).toEqual(["Mapa estelar", "Suporte"]);
    expect(meshBounds([part(out, "Placa")])!.max[2]).toBeCloseTo(D.thickness, 6);
  });
});
