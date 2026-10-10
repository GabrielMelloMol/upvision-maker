import { beforeAll, describe, expect, test } from "vitest";
import { bedMm, setBed } from "../bed";
import { meshBounds } from "../bounds";
import type { CS, ManifoldToplevel } from "../manifold";
import { getManifold } from "../manifold";
import { scoped } from "../shape2d";
import { bedWarnings } from "../../tools/models/bedCheck";
import { MissingInput, type ModelCtx } from "./common";
import { buildKitCard, CARD_MM, cleanSilhouette, componentCount, DEFAULT_KIT_CARD as D, gateHeight, gateWidth, packRows, type KitCardParams } from "./kitCard";

let M: ManifoldToplevel;
beforeAll(async () => {
  M = await getManifold();
});

const poly = (...pts: [number, number][]) => new M.CrossSection([pts], "NonZero");
const box = (x0: number, y0: number, x1: number, y1: number) => poly([x0, y0], [x1, y0], [x1, y1], [x0, y1]);
const union = (...c: CS[]) => M.CrossSection.union(c);
const text = (s: string, h: number) => (s.trim() ? M.CrossSection.square([h * 0.5 * [...s.trim()].length, h], true) : null);

/** Imagens de teste: o que um usuário pode mandar, do simples ao bagunçado. */
const IMAGES: Record<string, () => CS> = {
  /** Silhueta simples e cheia (fuselagem com nariz e cauda). */
  simples: () => poly([0, 6], [20, 0], [80, 2], [100, 9], [80, 20], [60, 28], [30, 24], [10, 16]),
  /** Com buracos: uma janela grande (fica) e furinhos (são preenchidos). */
  buracos: () => poly([0, 0], [100, 0], [100, 30], [0, 30]).subtract(union(box(30, 10, 60, 22), box(10, 10, 12, 12), box(80, 5, 82, 7))),
  /** Com partes finas: um corpo e 40 dentes de 0,4 mm (um pente de antenas). */
  finas: () => union(box(0, 0, 100, 8), ...Array.from({ length: 40 }, (_, i) => box(i * 2.5, 8, i * 2.5 + 0.4, 38))),
  /** Desenho em pedaços: 3 blocos separados por frestas de 1,5 mm, uma ilha média e poeira. */
  pedacos: () => union(box(0, 0, 30, 20), box(31.5, 0, 62, 24), box(63.5, 2, 100, 18), box(40, 30, 50, 36), box(70, 40, 70.8, 40.8), box(10, 30, 10.5, 30.6)),
  /** Traço aberto: um "C" de linha de 2 mm com a abertura de 1,2 mm (contorno que não fecha). */
  aberto: () => union(box(0, 0, 100, 2), box(0, 22, 100, 24), box(0, 0, 2, 10), box(0, 11.2, 2, 24), box(98, 0, 100, 24)),
};
const WINGS = () => poly([0, 25], [40, 0], [60, 8], [100, 25], [60, 42], [40, 50]);

const ctx = (art: CS | null, art2: CS | null = null): ModelCtx => ({ M, art, art2, text });
const build = (p: Partial<KitCardParams> = {}, art: CS | null = IMAGES.simples(), art2: CS | null = null) => buildKitCard(ctx(art, art2), { ...D, spines: 1, ...p });
const part = (o: ReturnType<typeof build>, name: string) => o.models[0].parts.find((x) => x.name === name)?.mesh;
const solid = (m: { positions: Float32Array; indices: Uint32Array }) => M.Manifold.ofMesh(new M.Mesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices }));
const areaAt = (m: Parameters<typeof solid>[0], z: number) => {
  const s = solid(m), cs = s.slice(z), a = cs.area();
  cs.delete();
  s.delete();
  return a;
};
const vol = (...a: ReturnType<typeof solid>[]) => a.reduce((x, y) => x.intersect(y)).volume();

describe("limpeza da silhueta: cada peça é UM sólido (#193)", { timeout: 60_000 }, () => {
  const opts = { close: 1, minIsland: 6, minHole: 8, bridgeW: 1.2 };
  const clean = (cs: CS, o = {}) => scoped((k) => {
    const r = cleanSilhouette(M, cs, { ...opts, ...o }, k);
    return { area: r.cs.area(), n: componentCount(r.cs), report: r.report, holes: (r.cs.toPolygons() as [number, number][][]).filter((q) => q.reduce((s, [x, y], i) => s + (x * q[(i + 1) % q.length][1] - q[(i + 1) % q.length][0] * y), 0) < 0).length };
  });

  test("fechamento morfológico: duas partes a menos de 2 × raio viram uma; a mais longe continua separada", () => {
    expect(clean(union(box(0, 0, 10, 10), box(11.5, 0, 21.5, 10)), { minIsland: 0 }).n).toBe(1);
    expect(clean(union(box(0, 0, 10, 10), box(14, 0, 24, 10)), { minIsland: 0, bridgeW: 1 }).n).toBe(1); // separada, mas ligada por ponte
    expect(clean(union(box(0, 0, 10, 10), box(14, 0, 24, 10)), { minIsland: 0, bridgeW: 1 }).report.bridged).toBe(1);
  });

  test("contorno aberto: a abertura de 1,2 mm fecha e, como o desenho era só linha, o miolo é preenchido (peça maciça)", () => {
    const c = IMAGES.aberto();
    const open = clean(c, { close: 0 });
    expect(open.holes).toBe(0); // aberto: o vão está ligado ao fora, não há buraco
    expect(open.report.hollowFilled).toBe(false);
    const r = clean(c);
    expect(r.n).toBe(1);
    expect(r.report.hollowFilled).toBe(true);
    expect(r.holes).toBe(0);
    expect(r.area).toBeCloseTo(100 * 24, -1); // o retângulo todo
  });

  test("buracos pequenos são preenchidos e os grandes ficam", () => {
    const r = clean(IMAGES.buracos());
    expect(r.report.filled).toBe(2); // os furinhos de 2 × 2 mm
    expect(r.holes).toBe(1); // a janela de 30 × 12 fica
    expect(r.n).toBe(1);
  });

  test("ilhas: as minúsculas somem (com contagem) e as médias são ligadas ao corpo por ponte", () => {
    const r = clean(IMAGES.pedacos());
    expect(r.n).toBe(1);
    expect(r.report.dropped).toBeGreaterThanOrEqual(2); // poeira de 0,8 × 0,8 e 0,5 × 0,6 mm
    expect(r.report.bridged).toBeGreaterThanOrEqual(1); // a ilha de 10 × 6 mm
    expect(r.area).toBeGreaterThan(IMAGES.pedacos().area() * 0.95);
  });

  test("a mesma imagem limpa duas vezes não muda mais (idempotente)", () => {
    const once = scoped((k) => cleanSilhouette(M, IMAGES.pedacos(), opts, k).cs.area());
    const twice = scoped((k) => cleanSilhouette(M, cleanSilhouette(M, IMAGES.pedacos(), opts, k).cs, opts, k).cs.area());
    expect(Math.abs(twice / once - 1)).toBeLessThan(0.01);
  });
});

describe("kit card: o cartão com galhos, pontos de corte e números (#193)", { timeout: 120_000 }, () => {
  for (const [name, make] of Object.entries(IMAGES)) {
    test(`imagem "${name}": todas as peças inteiras (1 componente), ligadas à moldura, com ≥ 2 pontos de corte finos e sem sobreposição`, () => {
      const o = build({ showAssembled: false }, make());
      const meta = o.meta!;
      const pieces = solid(part(o, "Peças")!), card = solid(part(o, "Cartão")!);
      // peças inteiras: cada peça é um componente (e há uma por peça planejada)
      const comps = pieces.decompose();
      expect(comps.length).toBe(meta.pieces);
      // cartão (moldura + galhos + pontos de corte) é um sólido só
      expect(card.decompose().length).toBe(1);
      // tudo ligado: na camada dos pontos de corte, moldura e peças formam uma região só (os pontos de corte encostam em cada peça)
      const layer = (m: Parameters<typeof solid>[0]) => {
        const sd = solid(m), cs = sd.slice(gateHeight(1.6) / 2);
        sd.delete();
        return cs;
      };
      const [lc, lp] = [layer(part(o, "Cartão")!), layer(part(o, "Peças")!)];
      // a malha das peças e a do cartão são separadas (float32): 0,02 mm de tolerância onde os pontos de corte encostam
      const [dc, dp] = [lc.offset(0.02, "Miter"), lp.offset(0.02, "Miter")];
      const joined = M.CrossSection.union([dc, dp]);
      expect(componentCount(joined), "moldura + peças = uma região só").toBe(1);
      [lc, lp, dc, dp, joined].forEach((c) => c.delete());
      // cada peça tem ≥ 2 pontos de corte
      meta.gatesPerPiece.forEach((n, i) => expect(n, `peça ${i + 1}`).toBeGreaterThanOrEqual(2));
      // sem sobreposição: peças entre si e peças × cartão
      for (let i = 0; i < comps.length; i++) for (let j = i + 1; j < comps.length; j++) expect(vol(comps[i], comps[j])).toBeLessThan(1e-6);
      expect(vol(pieces, card)).toBeLessThan(1e-3);
      [pieces, card, ...comps].forEach((s) => s.delete());
    });
  }

  test("pontos de corte: largura e espessura pelo bico (0,4: 0,8 × 0,4; 0,6: 1,2 × 0,6) e mais finos que a placa", () => {
    for (const nozzle of [0.4, 0.6]) {
      setBed({ x: 256, y: 256, z: 256, nozzle });
      try {
        const o = build({ showAssembled: false, thickness: 1.6 });
        const gw = gateWidth(), gh = gateHeight(1.6);
        expect(gw).toBeCloseTo(Math.max(2 * nozzle, 0.8), 6);
        expect(gh).toBeCloseTo(nozzle, 6);
        const card = part(o, "Cartão")!;
        const gatesBelow = areaAt(card, gh - 0.03) - areaAt(card, gh + 0.03); // só os pontos de corte existem abaixo do topo deles
        expect(gatesBelow).toBeGreaterThan(0);
        // cada ponto de corte = gw × comprimento (≈ gap): a área bate com (nº de pontos) × gw × comprimento
        const n = o.meta!.gatesPerPiece.reduce((a, b) => a + b, 0);
        const len = gatesBelow / (n * gw);
        expect(len).toBeGreaterThan(D.gap - 0.6);
        expect(len).toBeLessThan(D.gap * 3);
        expect(gh).toBeLessThan(1.6); // mais fino que a placa
      } finally {
        setBed(null);
      }
    }
  });

  test("galhos em grade: com várias fileiras o cartão tem galhos entre as fileiras e entre as peças, e continua um sólido só", () => {
    const o = build({ cardSize: "medium", ribs: 8, showAssembled: false });
    const card = solid(part(o, "Cartão")!);
    expect(card.decompose().length).toBe(1);
    // área do cartão acima dos pontos de corte (só moldura + galhos) maior que a moldura sozinha
    const [W, H] = CARD_MM.medium;
    const frameOnly = W * H - (W - 2 * D.frame) * (H - 2 * D.frame - 10.2);
    expect(areaAt(part(o, "Cartão")!, 1)).toBeGreaterThan(frameOnly * 1.15);
    card.delete();
  });

  test("nome e número de cada peça GRAVADOS rente na moldura e nos galhos: um número por peça + o nome, sem mudar a espessura do cartão", () => {
    const o = build({ showAssembled: false, engrave: 0.6 });
    const marks = solid(part(o, "Título")!);
    expect(marks.decompose().length).toBe(o.meta!.pieces + 1); // um por peça + o nome do kit
    const b = meshBounds([part(o, "Título")!])!;
    expect(b.max[2]).toBeCloseTo(D.thickness, 3); // rente à moldura
    expect(b.min[2]).toBeCloseTo(D.thickness - 0.6, 3);
    // no cartão o material saiu: a área em z = t − 0,3 é menor que em z = t − 0,9 (abaixo da gravação)
    const card = part(o, "Cartão")!;
    expect(areaAt(card, D.thickness - 0.3)).toBeLessThan(areaAt(card, D.thickness - 0.9) - 5);
    // o cartão continua com a espessura da placa (a gravação não passa dela) e o texto não pisa nas peças
    expect(meshBounds([card])!.max[2]).toBeCloseTo(D.thickness, 3);
    const pieces = solid(part(o, "Peças")!);
    expect(vol(marks, pieces)).toBeLessThan(1e-3);
    // moldura fina por padrão
    expect(D.frame).toBeLessThanOrEqual(2.5);
    [marks, pieces].forEach((s) => s.delete());
  });

  test("cartão dentro da mesa e no tamanho pedido (cartão de crédito até o maior), na espessura pedida", () => {
    for (const size of ["credit", "medium", "large", "xlarge"] as const) {
      const o = build({ cardSize: size, ribs: size === "credit" ? 2 : 6, showAssembled: false });
      const b = meshBounds([part(o, "Cartão")!])!;
      expect([b.max[0] - b.min[0], b.max[1] - b.min[1]]).toEqual([expect.closeTo(CARD_MM[size][0], 1), expect.closeTo(CARD_MM[size][1], 1)]);
      expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(bedMm());
      expect(b.min[2]).toBeCloseTo(0);
      expect(b.max[2]).toBeCloseTo(1.6, 3);
      expect(bedWarnings(o.models, [])).toEqual([]);
    }
    // numa mesa pequena o maior avisa (e o modelo montado de prévia não conta)
    setBed({ x: 200, y: 200, z: 200 });
    try {
      const o = build({ cardSize: "xlarge", showAssembled: true });
      expect(bedWarnings(o.models, []).join(" ")).toMatch(/passa da mesa de 200 mm/);
      expect(bedWarnings(build({ cardSize: "large", showAssembled: true }).models, [])).toEqual([]);
    } finally {
      setBed(null);
    }
  });
});

describe("kit card: as peças e o montado (#193)", { timeout: 120_000 }, () => {
  const assembledSolids = (o: ReturnType<typeof build>) => Object.fromEntries(o.models[1].parts.map((q) => [q.name.replace("Montado: ", ""), solid(q.mesh)]));

  for (const [name, make] of Object.entries(IMAGES)) {
    test(`imagem "${name}": o montado não tem colisão (lateral × costelas × base) e as costelas cruzam a lateral`, () => {
      const o = build({ ribs: 5 }, make());
      const s = assembledSolids(o);
      const names = Object.keys(s);
      expect(names.filter((n) => n.startsWith("costela")).length).toBe(o.meta!.ribs);
      for (let i = 0; i < names.length; i++)
        for (let j = i + 1; j < names.length; j++) expect(vol(s[names[i]], s[names[j]]), `${names[i]} × ${names[j]}`).toBeLessThan(1e-6);
      // cada costela toca a lateral (cruzam: a caixa da costela contém o plano da lateral)
      const lat = s.lateral.boundingBox();
      for (const n of names.filter((q) => q.startsWith("costela"))) {
        const b = s[n].boundingBox();
        expect(b.min[1]).toBeLessThan(lat.min[1] + 1e-6);
        expect(b.max[1]).toBeGreaterThan(lat.max[1] - 1e-6);
        expect(b.min[0]).toBeGreaterThan(lat.min[0] - 1e-6);
        expect(b.max[0]).toBeLessThan(lat.max[0] + 1e-6);
      }
      Object.values(s).forEach((x) => x.delete());
    });
  }

  test("fendas casam com a espessura + folga: a da lateral, a da costela e a janela da base medem t + folga", () => {
    for (const fit of [0.1, 0.2, 0.35]) {
      const o = build({ fit, thickness: 1.6, ribs: 4 });
      const t = 1.6, slot = t + fit;
      const s = assembledSolids(o);
      // a folga de verdade no encaixe: a costela entra na fenda da lateral sem tocar, e sobra `fit` no total
      const lat = s.lateral;
      for (const n of Object.keys(s).filter((q) => q.startsWith("costela"))) {
        expect(vol(lat, s[n])).toBeLessThan(1e-6);
        // costela engrossada em `fit/2 + 0,01` por lado passaria a bater na lateral (a folga é a pedida, nem mais nem menos)
        const rb = s[n].boundingBox();
        const mid = (rb.min[0] + rb.max[0]) / 2;
        const zc = (rb.min[2] + rb.max[2]) / 2; // a fenda da lateral vai do meio da costela para cima
        const cut = (w: number) => M.Manifold.cube([w, 400, 400], false).translate([mid - w / 2, -200, zc + 0.3]);
        const slab = cut(slot - 0.01);
        const inFit = lat.intersect(slab);
        expect(inFit.volume(), "a fenda tem a largura t + folga").toBeLessThan(1e-6); // nada da lateral dentro da fenda
        const wider = lat.intersect(cut(slot + 0.05));
        expect(wider.volume()).toBeGreaterThan(0); // mas já 0,05 além o material aparece
        slab.delete();
        inFit.delete();
        wider.delete();
      }
      // janela da base = lingueta + folga: o corte da lateral passa pela base
      expect(vol(s.base, lat)).toBeLessThan(1e-6);
      Object.values(s).forEach((x) => x.delete());
    }
  });

  test("duas placas laterais: duas laterais, costelas com duas fendas, base com duas janelas e sem colisão", () => {
    const o = build({ spines: 2, maxWidth: 60, ribs: 4 });
    expect(o.meta!.spines).toBe(2);
    const s = assembledSolids(o);
    expect(Object.keys(s).filter((n) => n.startsWith("lateral")).length).toBe(2);
    const names = Object.keys(s);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) expect(vol(s[names[i]], s[names[j]])).toBeLessThan(1e-6);
    Object.values(s).forEach((x) => x.delete());
    // largura máxima pequena demais para duas placas: cai para uma e avisa
    const narrow = build({ spines: 2, maxWidth: 12, ribs: 4 });
    expect(narrow.meta!.spines).toBe(1);
    expect(narrow.warnings!.join(" ")).toMatch(/saiu só uma/);
  });

  test("ajustes: número de costelas, largura máxima e perfil mudam o modelo", () => {
    const n = (r: number) => build({ ribs: r, showAssembled: false }).meta!.ribs;
    expect(n(3)).toBe(3);
    expect(n(8)).toBeGreaterThan(n(3));
    const w = (maxWidth: number) => {
      const o = build({ maxWidth, ribs: 4 });
      const sol = assembledSolids(o);
      const b = Object.entries(sol).filter(([n]) => n.startsWith("costela")).map(([, x]) => x.boundingBox());
      return Math.max(...b.map((x) => x.max[1] - x.min[1]));
    };
    expect(w(60)).toBeGreaterThan(w(30) * 1.5);
    const area = (profile: "oval" | "boxy") => volume(build({ profile, ribs: 4 }));
    expect(area("boxy")).toBeGreaterThan(area("oval"));
    function volume(o: ReturnType<typeof build>) {
      return o.models[1].parts.filter((q) => q.name.includes("costela")).reduce((s, q) => s + solid(q.mesh).volume(), 0);
    }
  });

  test("se há segunda imagem (vista de cima), a largura das costelas vem dela: mais larga onde as asas são largas", () => {
    const o = build({ ribs: 5, maxWidth: 50 }, IMAGES.simples(), WINGS());
    const widths = o.models[1].parts.filter((q) => q.name.includes("costela")).map((q) => meshBounds([q.mesh])!).map((b) => b.max[1] - b.min[1]);
    expect(widths.length).toBe(5);
    // asas: largura máxima perto de 40–60 % do comprimento; nas pontas é bem menor
    expect(Math.max(...widths)).toBeGreaterThan(widths[0] * 1.2);
    expect(widths.indexOf(Math.max(...widths))).toBeGreaterThan(0);
    expect(widths.indexOf(Math.max(...widths))).toBeLessThan(4);
  });

  test("avisos: pedaços ligados/descartados, partes finas pelo bico, costelas descartadas; imagem obrigatória; cartão pequeno demais", () => {
    const w = (o: ReturnType<typeof build>) => o.warnings!.join(" ");
    expect(w(build({ showAssembled: false }, IMAGES.pedacos()))).toMatch(/descartados/);
    expect(w(build({ showAssembled: false }, IMAGES.pedacos()))).toMatch(/ligados ao corpo/);
    expect(w(build({ showAssembled: false }, IMAGES.simples()))).not.toMatch(/descartados|ligados ao corpo|mais finas/);
    setBed({ x: 256, y: 256, z: 256, nozzle: 0.6 });
    try {
      expect(w(build({ showAssembled: false, close: 0 }, IMAGES.finas()))).toMatch(/partes mais finas que o bico \(0,6 mm\)/);
      expect(w(build({ showAssembled: false, frame: 2 }))).toMatch(/Moldura de 2 mm é fina para o bico de 0,6 mm/);
    } finally {
      setBed(null);
    }
    expect(() => build({}, null)).toThrow(MissingInput);
    const tall = poly([0, 0], [10, 0], [10, 300], [0, 300]);
    expect(() => build({ cardSize: "credit" }, tall)).toThrow(/não cabem/);
  });

  test("arrumação em fileiras respeita o galho e o comprimento do ponto de corte", () => {
    const dims = [60, 50, 40, 30].map((w, i) => ({ id: i, w, h: 20 + i * 5 }));
    expect(packRows(dims, 400, 200, 3, 4.5)!.rows).toHaveLength(1);
    const two = packRows(dims, 120, 200, 3, 4.5)!;
    expect(two.rows.length).toBeGreaterThan(1);
    two.extraW.forEach((e) => expect(e).toBeGreaterThanOrEqual(0));
    expect(two.extraH).toBeGreaterThanOrEqual(0);
    expect(packRows(dims, 50, 200, 3, 4.5)).toBeNull(); // peça mais larga que o vão
    expect(packRows(dims, 400, 20, 3, 4.5)).toBeNull(); // altura demais
  });
});

describe("kit card: modo veículo (laterais + chassi + 4 rodas) (#193)", { timeout: 120_000 }, () => {
  const vehicle = (p: Partial<KitCardParams> = {}, art: CS | null = IMAGES.simples()) => build({ mode: "vehicle", cardSize: "large", ...p }, art);
  const comps = (o: ReturnType<typeof build>, name: string) => {
    const s = solid(part(o, name)!), n = s.decompose().length;
    s.delete();
    return n;
  };

  for (const [name, make] of Object.entries(IMAGES)) {
    test(`imagem "${name}": 2 laterais + chassi + 4 rodas, cada peça inteira, todas presas por ≥ 2 pontos de corte e sem sobreposição`, () => {
      const o = vehicle({ showAssembled: false }, make());
      expect(o.meta!.pieces).toBe(7);
      expect(comps(o, "Peças")).toBe(3); // 2 laterais + chassi
      expect(comps(o, "Rodas")).toBe(4);
      expect(comps(o, "Pneus")).toBe(4);
      o.meta!.gatesPerPiece.forEach((n) => expect(n).toBeGreaterThanOrEqual(2));
      const [pieces, wheels, tires, card] = ["Peças", "Rodas", "Pneus", "Cartão"].map((n) => solid(part(o, n)!));
      for (const [a, b] of [[pieces, wheels], [pieces, tires], [wheels, tires], [pieces, card], [wheels, card], [tires, card]] as const) expect(vol(a, b)).toBeLessThan(1e-3);
      [pieces, wheels, tires, card].forEach((s) => s.delete());
    });

    test(`imagem "${name}": o veículo montado não tem colisão e as rodas ficam por fora das laterais`, () => {
      const o = vehicle({}, make());
      const s = Object.fromEntries(o.models[1].parts.map((q) => [q.name.replace("Montado: ", ""), solid(q.mesh)]));
      const names = Object.keys(s);
      expect(names.filter((n) => n.startsWith("roda")).length).toBe(4);
      expect(names.filter((n) => n.startsWith("lateral")).length).toBe(2);
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) expect(vol(s[names[i]], s[names[j]]), `${names[i]} × ${names[j]}`).toBeLessThan(1e-6);
      // as rodas ficam fora das laterais (|Y| maior) e o eixo atravessa o furo da lateral
      const lat = s["lateral 1"].boundingBox();
      for (const n of names.filter((q) => q.startsWith("roda"))) {
        const b = s[n].boundingBox();
        const outside = b.min[1] >= lat.max[1] - 0.5 - 1e-6 || b.max[1] <= lat.min[1] + 0.5 + 1e-6 || b.min[1] < lat.min[1] || b.max[1] > lat.max[1];
        expect(outside, n).toBe(true);
      }
      Object.values(s).forEach((x) => x.delete());
    });
  }

  test("o eixo entra no furo da lateral por pressão: furo = eixo + folga do eixo, e o eixo atravessa a lateral", () => {
    for (const axleFit of [0.1, 0.2, 0.3]) {
      const o = vehicle({ axleFit, thickness: 1.6 });
      const s = Object.fromEntries(o.models[1].parts.map((q) => [q.name.replace("Montado: ", ""), solid(q.mesh)]));
      const lat = s["lateral 1"];
      const zMid = (lat.boundingBox().min[2] + lat.boundingBox().max[2]) / 2;
      // fatia horizontal na altura do furo (o centro do eixo): a lateral é uma tira fina de largura t e o furo a abre
      const roda = s["roda 1"].boundingBox();
      const axisZ = (roda.min[2] + roda.max[2]) / 2;
      const cs = lat.slice(axisZ);
      const rings = (cs.toPolygons() as [number, number][][]).map((r) => ({ w: Math.max(...r.map((q) => q[0])) - Math.min(...r.map((q) => q[0])) }));
      // na altura do furo a lateral tem 3 tiras (antes, entre e depois dos dois furos): os vãos medem o diâmetro do furo
      const xs = (cs.toPolygons() as [number, number][][]).flatMap((r) => r.map((q) => q[0])).sort((a, b) => a - b);
      void rings;
      void xs;
      cs.delete();
      // medida direta: o furo tem raio = raio do eixo + folga/2 (a interseção do eixo engrossado pela folga com a lateral é só vazio)
      const pinR = Math.max(1.5, 2 * 0.4);
      const probe = (r: number) => {
        const cyl = M.Manifold.cylinder(40, r, r, 64, true).rotate([90, 0, 0]).translate([roda.min[0] + (roda.max[0] - roda.min[0]) / 2, 0, axisZ]);
        const v = lat.intersect(cyl).volume();
        cyl.delete();
        return v;
      };
      expect(probe(pinR + axleFit / 2 - 0.01), "dentro do furo não há lateral").toBeLessThan(1e-6);
      expect(probe(pinR + axleFit / 2 + 0.05), "um pouco além do furo há lateral").toBeGreaterThan(1e-3);
      void zMid;
      Object.values(s).forEach((x) => x.delete());
    }
  });

  test("pneu opcional em outra cor: sem pneu não há parte de pneu; com pneu, a roda é menor e o pneu ocupa o anel", () => {
    const withTire = vehicle({ tire: 2, showAssembled: false });
    const none = vehicle({ tire: 0, showAssembled: false });
    expect(part(none, "Pneus")).toBeUndefined();
    expect(part(withTire, "Pneus")).toBeDefined();
    const hub = (o: ReturnType<typeof build>) => meshBounds([part(o, "Rodas")!])!;
    const wTire = hub(withTire), wNone = hub(none);
    // o cubo com pneu é menor que a roda sem pneu (o diâmetro total é o mesmo)
    expect(wTire.max[0] - wTire.min[0]).toBeLessThan(wNone.max[0] - wNone.min[0] + 1e-6);
    const parts = Object.fromEntries(withTire.models[0].parts.map((q) => [q.name, q.color]));
    expect(parts["Pneus"]).toBe(D.tireColor);
    expect(parts["Rodas"]).toBe(D.wheelColor);
    expect(parts["Cartão"]).toBe(D.frameColor);
  });

  test("multicor: cartão, peças, rodas, pneus e o nome gravado têm cores próprias (ex.: rodas pretas, cartão branco)", () => {
    const o = vehicle({ showAssembled: false, frameColor: "#ffffff", wheelColor: "#000000", tireColor: "#222222", pieceColor: "#c9cdd2", titleColor: "#cc0000" });
    const byName = Object.fromEntries(o.models[0].parts.map((q) => [q.name, q.color]));
    expect(byName).toEqual({ Cartão: "#ffffff", Peças: "#c9cdd2", Rodas: "#000000", Pneus: "#222222", Título: "#cc0000" });
  });

  test("cartões pequenos cabem vários por mesa: N cartões iguais na grade, dentro da mesa, sem se tocar", () => {
    const o = build({ cardSize: "credit", ribs: 2, copies: 6, showAssembled: false });
    expect(o.models).toHaveLength(6);
    const bs = o.models.map((m) => meshBounds(m.parts.map((q) => q.mesh))!);
    const all = meshBounds(o.models.flatMap((m) => m.parts.map((q) => q.mesh)))!;
    expect(all.max[0] - all.min[0]).toBeLessThanOrEqual(bedMm());
    expect(all.max[1] - all.min[1]).toBeLessThanOrEqual(bedMm());
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const sepX = bs[i].min[0] >= bs[j].max[0] - 1e-6 || bs[j].min[0] >= bs[i].max[0] - 1e-6;
        const sepY = bs[i].min[1] >= bs[j].max[1] - 1e-6 || bs[j].min[1] >= bs[i].max[1] - 1e-6;
        expect(sepX || sepY, `${i} × ${j}`).toBe(true);
      }
    expect(bedWarnings(o.models, [])).toEqual([]);
    // demais para a mesa: avisa
    setBed({ x: 100, y: 100, z: 100 });
    try {
      const many = build({ cardSize: "credit", ribs: 2, copies: 8, showAssembled: false });
      expect(many.warnings!.join(" ")).toMatch(/Só 1 cartão\(ões\) de 85.6 × 54 mm cabem juntos numa mesa de 100 mm \(você pediu 8\)/);
      expect(many.models).toHaveLength(1); // nunca passa da mesa
    } finally {
      setBed(null);
    }
  });

  test("avisos do veículo e modo figura: texto de montagem de cada modo; 2 laterais por padrão na figura", () => {
    expect(vehicle({ showAssembled: false }).warnings!.join(" ")).toMatch(/prenda as 4 rodas apertando o eixo no furo/);
    const fig = build({ spines: 2, showAssembled: false });
    expect(fig.warnings!.join(" ")).toMatch(/desça cada costela/);
    expect(fig.meta!.spines).toBe(2);
    expect(D.mode).toBe("figure");
    expect(D.spines).toBe(2);
  });
});
