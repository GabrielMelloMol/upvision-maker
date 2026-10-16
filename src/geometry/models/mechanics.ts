import { bedMm } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { scoped } from "../shape2d";
import { gearOutline, gearRadii, ringCavitySpec, spurSpec } from "./gears";
import { solidMesh, type ModelCtx, type ModelOutput } from "./common";

type K = <D extends { delete(): void }>(o: D) => D;
const SEG = 96;
const GAP = 8;
const deg = (r: number) => (r * 180) / Math.PI;
const br = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
const col = (name: string, color: string, s: Solid) => ({ name, color, mesh: solidMesh(s) });

// ================================================================ engrenagem

export type SpurGearParams = {
  teeth: number;
  module: number;
  pressure: number;
  thickness: number;
  bore: number;
  /** Folga entre os dentes (mm): tirada da espessura do dente, para FDM. */
  backlash: number;
  hub: boolean;
  /** Mostra também a segunda engrenagem do par, com `teeth2` dentes, à distância certa. */
  pair: boolean;
  teeth2: number;
  color: string;
};
export const DEFAULT_SPUR_GEAR: SpurGearParams = { teeth: 20, module: 2, pressure: 20, thickness: 8, bore: 5, backlash: 0.2, hub: true, pair: true, teeth2: 36, color: "#0ea5e9" };

const HUB_T = 6, HUB_WALL = 3.5;

/** Corpo de uma engrenagem: perfil extrudado, furo e cubo opcional (com a espessura somada). */
function gearSolid(M: ManifoldToplevel, k: K, p: { teeth: number; module: number; pressure: number; backlash: number; thickness: number; bore: number; hub: boolean }): Solid {
  const spec = spurSpec(p.teeth, p.module, p.pressure, p.backlash);
  const outline = k(gearOutline(M, spec));
  let body: Solid = k(outline.extrude(p.thickness));
  const { rf } = gearRadii(spec);
  if (p.hub) {
    const hubR = Math.min(rf - 1, p.bore / 2 + HUB_WALL);
    if (hubR > p.bore / 2 + 1) body = k(M.Manifold.union([body, k(k(M.Manifold.cylinder(HUB_T, hubR, hubR, SEG)).translate([0, 0, p.thickness - 0.01]))]));
  }
  return k(body.subtract(k(k(M.Manifold.cylinder(p.thickness + HUB_T + 2, p.bore / 2, p.bore / 2, 48)).translate([0, 0, -1]))));
}

/** Engrenagem de dentes retos (#230): perfil de involuta pelo módulo e número de dentes, com folga para FDM, e o par engrenado. */
export function buildSpurGear(ctx: ModelCtx, p: SpurGearParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    if (p.teeth < 9) warnings.push("Menos de 9 dentes: o pé do dente é cortado e a engrenagem engata mal. Use 9 ou mais.");
    const sp = spurSpec(p.teeth, p.module, p.pressure, p.backlash);
    const r = gearRadii(sp);
    if (p.bore / 2 + 1 > r.rf) warnings.push("O furo é grande demais para essa engrenagem: aumente os dentes ou o módulo.");
    if (p.module < 0.8) warnings.push("Módulo abaixo de 0,8: os dentes ficam finos para o bico de 0,4 mm.");
    const g1 = gearSolid(M, k, p);
    const models = [{ name: `Engrenagem ${p.teeth}`, parts: [col("Engrenagem", p.color, g1)] }];
    if (p.pair) {
      const a = (p.module * (p.teeth + p.teeth2)) / 2;
      const g2 = gearSolid(M, k, { ...p, teeth: p.teeth2 });
      // o vão da segunda fica de frente para o dente da primeira (par: com número de dentes par o dente cai em 180°, ímpar o vão)
      const phase = p.teeth2 % 2 === 0 ? 180 / p.teeth2 : 0;
      const placed = k(k(g2.rotate([0, 0, phase])).translate([a, 0, 0]));
      models[0] = { name: "Par de engrenagens", parts: [col("Engrenagem", p.color, g1), col("Engrenagem 2", p.color, placed)] };
      warnings.push(`Par engrenado: distância entre os eixos ${br(a, 2)} mm, redução ${br(p.teeth2 / p.teeth, 2)} : 1.`);
      if (a + gearRadii(spurSpec(p.teeth2, p.module, p.pressure, p.backlash)).ra > bedMm() / 2 + 20) warnings.push("O par é grande para a mesa: confira o tamanho.");
    }
    return { models, warnings };
  });
}

// ================================================================ polia e correia

export type PulleyParams = { teeth: number; pitch: number; bore: number; width: number; flange: boolean; setScrew: boolean; clearance: number; color: string };
export const DEFAULT_PULLEY: PulleyParams = { teeth: 20, pitch: 2, bore: 5, width: 7, flange: true, setScrew: true, clearance: 0.15, color: "#f97316" };

const GROOVE_R = 0.8; // raio do vão do dente da correia (GT2, passo 2)
const HUB_LEN = 7, HUB_WALL_PULLEY = 3, MIN_WALL = 1.2;

/**
 * Polia de correia dentada (#230): GT2 (passo 2) ou HTD 3M (passo 3). O diâmetro de fora é o primitivo menos o recuo da correia, os
 * vãos são redondos e levam a folga da impressora; aba nos dois lados e cubo com parafuso de fixação opcionais.
 */
export function buildPulley(ctx: ModelCtx, p: PulleyParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const pd = (p.teeth * p.pitch) / Math.PI;
    const od = pd - (p.pitch === 2 ? 0.254 : 0.381);
    const grooveR = (GROOVE_R * p.pitch) / 2 + p.clearance;
    const ro = od / 2;
    if (p.teeth < 12) warnings.push("Menos de 12 dentes: a correia dobra demais e desgasta. Use 12 ou mais.");
    if (p.bore / 2 + MIN_WALL > ro - grooveR) warnings.push("O furo é grande demais para essa polia: aumente os dentes.");
    const disc = k(M.CrossSection.circle(ro, SEG * 2));
    const grooves = Array.from({ length: p.teeth }, (_, i) => {
      const a = (2 * Math.PI * i) / p.teeth;
      return k(k(M.CrossSection.circle(grooveR, 32)).translate([(ro + grooveR * 0.2) * Math.cos(a), (ro + grooveR * 0.2) * Math.sin(a)]));
    });
    const toothed = k(disc.subtract(k(M.CrossSection.union(grooves))));
    const flangeR = ro + 1.5;
    const flange = (z: number) => k(k(M.Manifold.cylinder(1, flangeR, flangeR, SEG * 2)).translate([0, 0, z]));
    const z0 = p.flange ? 1 : 0;
    const toothedSolid = k(k(toothed.extrude(p.width)).translate([0, 0, z0]));
    let body: Solid = p.flange ? k(M.Manifold.union([toothedSolid, flange(0), flange(p.width + 1)])) : toothedSolid;
    const top = p.width + 2 * z0;
    const hubR = p.bore / 2 + HUB_WALL_PULLEY;
    if (p.setScrew) {
      body = k(M.Manifold.union([body, k(k(M.Manifold.cylinder(HUB_LEN, hubR, hubR, 64)).translate([0, 0, top - 0.01]))]));
      // parafuso de fixação (M3: Ø 2,6 para rosquear no plástico) na horizontal, no meio do cubo
      const screw = k(k(k(M.Manifold.cylinder(hubR + 2, 1.3, 1.3, 24)).rotate([0, 90, 0])).translate([0, 0, top + HUB_LEN / 2]));
      body = k(body.subtract(screw));
    }
    body = k(body.subtract(k(k(M.Manifold.cylinder(top + HUB_LEN + 2, p.bore / 2, p.bore / 2, 48)).translate([0, 0, -1]))));
    warnings.push(`Polia de ${p.teeth} dentes, diâmetro primitivo ${br(pd, 2)} mm e de fora ${br(od, 2)} mm, para correia de passo ${p.pitch} mm (${p.pitch === 2 ? "GT2" : "HTD 3M"}).`);
    return { models: [{ name: `Polia ${p.teeth}`, parts: [col("Polia", p.color, body)] }], warnings };
  });
}

export type BeltParams = { teeth: number; pitch: number; width: number; thickness: number; color: string };
export const DEFAULT_BELT: BeltParams = { teeth: 60, pitch: 2, width: 6, thickness: 1.2, color: "#1f2937" };

/** Correia dentada fechada (#230), para imprimir em TPU: anel com dentes por dentro no passo pedido (comprimento = dentes × passo). */
export function buildBelt(ctx: ModelCtx, p: BeltParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const R = (p.teeth * p.pitch) / (2 * Math.PI); // raio da linha primitiva
    const toothR = p.pitch * 0.32;
    if (p.teeth < 30) warnings.push("Correia curta: o TPU dobra demais e pode rachar. Use 30 dentes ou mais.");
    if (p.thickness < 1) warnings.push("Costas da correia finas: abaixo de 1 mm ela rasga.");
    const ring = k(k(M.CrossSection.circle(R + p.thickness, SEG * 2)).subtract(k(M.CrossSection.circle(R - toothR * 0.4, SEG * 2))));
    const bumps = Array.from({ length: p.teeth }, (_, i) => {
      const a = (2 * Math.PI * i) / p.teeth;
      return k(k(M.CrossSection.circle(toothR, 24)).translate([(R - toothR * 0.4) * Math.cos(a), (R - toothR * 0.4) * Math.sin(a)]));
    });
    const outline = k(M.CrossSection.union([ring, ...bumps]));
    if (2 * (R + p.thickness) > bedMm()) warnings.push(`A correia tem ${Math.round(2 * (R + p.thickness))} mm de diâmetro: passa da mesa.`);
    warnings.push(`Correia fechada de ${p.teeth} dentes, ${br(p.teeth * p.pitch, 0)} mm de comprimento. Imprima em TPU 95A, devagar e sem retração.`);
    return { models: [{ name: "Correia", parts: [col("Correia", p.color, k(outline.extrude(p.width)))] }], warnings };
  });
}

// ================================================================ sprocket e corrente

export type SprocketParams = { teeth: number; pitch: number; roller: number; width: number; bore: number; clearance: number; color: string };
/** Correntes de roletes mais comuns: passo, diâmetro do rolete e largura interna (mm). */
export const SPROCKET_PRESETS: Record<string, Pick<SprocketParams, "pitch" | "roller" | "width">> = {
  ansi25: { pitch: 6.35, roller: 3.3, width: 3 },
  ansi35: { pitch: 9.525, roller: 5.08, width: 4.2 },
  "06b": { pitch: 9.525, roller: 6.35, width: 5.2 },
  "08b": { pitch: 12.7, roller: 8.51, width: 7 },
};
export const DEFAULT_SPROCKET: SprocketParams = { teeth: 16, pitch: 9.525, roller: 5.08, width: 4.2, bore: 8, clearance: 0.25, color: "#a3a3a3" };

/**
 * Roda dentada de corrente de roletes (#230): círculo primitivo = passo ÷ (2·sen(180°/dentes)), um assento redondo por rolete
 * (com a folga da impressora) e a ponta dos dentes arredondada. Presets ANSI 25, ANSI 35, 06B e 08B.
 */
export function buildSprocket(ctx: ModelCtx, p: SprocketParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const pd = p.pitch / Math.sin(Math.PI / p.teeth);
    const R = pd / 2;
    const seatR = p.roller / 2 + p.clearance;
    const ro = R + p.roller * 0.25; // ponta do dente
    if (p.teeth < 9) warnings.push("Menos de 9 dentes: a corrente trabalha mal. Use 9 ou mais.");
    if (p.bore / 2 + 1.5 > R - seatR) warnings.push("O furo é grande demais para essa roda: aumente os dentes.");
    const disc = k(M.CrossSection.circle(ro, SEG * 2));
    const seats = Array.from({ length: p.teeth }, (_, i) => {
      const a = (2 * Math.PI * (i + 0.5)) / p.teeth;
      return k(k(M.CrossSection.circle(seatR, 40)).translate([R * Math.cos(a), R * Math.sin(a)]));
    });
    // alivia a quina de cada vão: um disco um pouco maior, afastado para fora, abre a entrada do rolete
    const reliefs = Array.from({ length: p.teeth }, (_, i) => {
      const a = (2 * Math.PI * (i + 0.5)) / p.teeth;
      return k(k(M.CrossSection.circle(seatR * 1.05, 40)).translate([(R + seatR * 0.7) * Math.cos(a), (R + seatR * 0.7) * Math.sin(a)]));
    });
    const toothed = k(k(disc.subtract(k(M.CrossSection.union([...seats, ...reliefs])))).offset(-0.3, "Round"));
    const rounded = k(toothed.offset(0.3, "Round"));
    const body = k(k(rounded.extrude(p.width)).subtract(k(k(M.Manifold.cylinder(p.width + 2, p.bore / 2, p.bore / 2, 48)).translate([0, 0, -1]))));
    if (2 * ro > bedMm()) warnings.push("A roda passa da mesa.");
    warnings.push(`Roda de ${p.teeth} dentes para corrente de passo ${br(p.pitch, 3)} mm: diâmetro primitivo ${br(pd, 2)} mm e de fora ${br(2 * ro, 2)} mm.`);
    return { models: [{ name: `Roda dentada ${p.teeth}`, parts: [col("Roda dentada", p.color, body)] }], warnings };
  });
}

export type ChainParams = { links: number; pitch: number; width: number; thickness: number; gap: number; color: string; twoColors: boolean; color2: string };
export const DEFAULT_CHAIN: ChainParams = { links: 8, pitch: 18, width: 10, thickness: 4, gap: 0.3, color: "#6366f1", twoColors: true, color2: "#f59e0b" };

/**
 * Corrente articulada impressa já montada (#230): elos chatos em meia-sobreposição, cada pino atravessa o furo do vizinho com a
 * folga `gap` e tem cabeça que o prende. Cada elo é uma peça separada; a folga vertical e a do furo valem o `gap` de impressora.
 */
export function buildChain(ctx: ModelCtx, p: ChainParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const T = p.thickness, W = p.width, g = p.gap;
    // placas alternadas: elo largo, elo estreito, elo largo...; o estreito limita o pino e a cabeça
    const small = 0.42 * W;
    const pinR = Math.max(1.2, small - 1.8);
    const holeR = pinR + g;
    const endR = (i: number) => (i % 2 === 0 ? W / 2 : small);
    if (T < 2.4 * 1) warnings.push("Elo fino: abaixo de 2,4 mm ele quebra no pino.");
    if (g < 0.2) warnings.push("Folga menor que 0,2 mm: os elos podem fundir. Use 0,3 mm ou mais.");
    if (p.pitch < W + 2) warnings.push("O passo é curto para a largura: os elos se encostam.");
    if (pinR + 1 > small) warnings.push("Elo estreito demais para a cabeça do pino: aumente a largura do elo.");
    const links: Solid[] = [];
    for (let i = 0; i < p.links; i++) {
      const x0 = i * p.pitch; // furo (esquerda) deste elo; o pino (direita) fica em x0 + passo
      const last = i === p.links - 1, first = i === 0;
      const r = endR(i);
      const end = (x: number) => k(k(M.CrossSection.circle(r, 48)).translate([x, 0]));
      // cintura: entre os dois terminais a placa afina para 45% da largura do terminal
      const waist = k(k(M.CrossSection.square([p.pitch, r * 0.9], true)).translate([x0 + p.pitch / 2, 0]));
      const plate = k(M.CrossSection.union([end(x0), end(x0 + p.pitch), waist]));
      let body: Solid = k(plate.extrude(T));
      // o recorte cobre o maior dos dois terminais que se encontram, mais a folga, senão a cintura de um toca o disco do outro
      const disk = (x: number, z0: number, h: number, other: number) => k(k(M.Manifold.cylinder(h, Math.max(r, other) + g, Math.max(r, other) + g, 48)).translate([x, 0, z0]));
      // meia-sobreposição: a ponta do furo fica só com a metade de cima, a do pino só com a de baixo
      if (!first) body = k(body.subtract(disk(x0, -0.01, T / 2 + g / 2 + 0.01, endR(i - 1))));
      if (!last) body = k(body.subtract(disk(x0 + p.pitch, T / 2 - g / 2, T / 2 + g / 2 + 0.01, endR(i + 1))));
      if (!first) body = k(body.subtract(k(k(M.Manifold.cylinder(T + 2, holeR, holeR, 40)).translate([x0, 0, -1]))));
      if (!last) {
        const pin = k(k(M.Manifold.cylinder(T + g + 1, pinR, pinR, 40)).translate([x0 + p.pitch, 0, 0]));
        const head = k(k(M.Manifold.cylinder(1, pinR + 1, pinR + 1, 40)).translate([x0 + p.pitch, 0, T + g]));
        body = k(M.Manifold.union([body, pin, head]));
      }
      links.push(body);
    }
    const length = (p.links - 1) * p.pitch + W;
    if (length > bedMm()) warnings.push(`A corrente tem ${Math.round(length)} mm: passa da mesa de ${bedMm()} mm. Use menos elos.`);
    warnings.push("Imprima sem suporte e sem brim nos pinos. Se os elos grudarem, aumente a folga de 0,05 em 0,05 mm; depois de esfriar, dobre cada junta.");
    if (p.twoColors && p.links > 1) {
      warnings.push("Duas cores: o fatiador troca de filamento a cada camada onde os dois tipos de elo aparecem (gasta mais filamento na torre). Desligue para imprimir em uma cor só.");
      const wide = k(M.Manifold.union(links.filter((_, i) => i % 2 === 0)));
      const narrow = k(M.Manifold.union(links.filter((_, i) => i % 2 === 1)));
      return { models: [{ name: "Corrente", parts: [col("Elos largos", p.color, wide), col("Elos estreitos", p.color2, narrow)] }], warnings };
    }
    const all = k(M.Manifold.union(links));
    return { models: [{ name: "Corrente", parts: [col("Corrente", p.color, all)] }], warnings };
  });
}

// ================================================================ planetário

export type PlanetaryParams = {
  module: number;
  sun: number;
  planet: number;
  planets: number;
  thickness: number;
  pressure: number;
  backlash: number;
  wall: number;
  bore: number;
  color: string;
  carrierColor: string;
};
export const DEFAULT_PLANETARY: PlanetaryParams = { module: 1.5, sun: 12, planet: 12, planets: 3, thickness: 8, pressure: 20, backlash: 0.25, wall: 4, bore: 5, color: "#0ea5e9", carrierColor: "#f59e0b" };

/** Planetas que fecham com o sol e a coroa: (sol + coroa) múltiplo de n e planetas sem encostar uns nos outros. */
export function planetCount(sun: number, planet: number, wanted: number, module: number): number {
  const ring = sun + 2 * planet;
  const rp = (module * (sun + planet)) / 2; // raio da órbita
  const ra = (module * planet) / 2 + module;
  for (let n = Math.min(8, wanted); n >= 2; n--) if ((sun + ring) % n === 0 && 2 * rp * Math.sin(Math.PI / n) > 2 * ra + 1) return n;
  return 0;
}

/**
 * Redutor planetário (#230): sol, planetas, coroa e porta-satélites. O número de dentes da coroa sai de sol + 2·planeta; os
 * planetas são girados até engrenar no sol e na coroa. Com a coroa parada, o sol entra e o porta-satélites sai: redução 1 + coroa/sol.
 */
export function buildPlanetary(ctx: ModelCtx, p: PlanetaryParams): ModelOutput {
  const { M } = ctx;
  return scoped((k) => {
    const warnings: string[] = [];
    const ringTeeth = p.sun + 2 * p.planet;
    const n = planetCount(p.sun, p.planet, p.planets, p.module);
    if (!n) throw new Error("Esses dentes não fecham: o sol + a coroa precisam ser múltiplos do número de planetas. Mude os dentes do sol ou dos planetas.");
    if (n !== p.planets) warnings.push(`Os dentes só fecham com ${n} planetas: usei ${n} em vez de ${p.planets}.`);
    const orbit = (p.module * (p.sun + p.planet)) / 2;
    const sunSpec = spurSpec(p.sun, p.module, p.pressure, p.backlash), planetSpec = spurSpec(p.planet, p.module, p.pressure, p.backlash);
    const cavity = ringCavitySpec(ringTeeth, p.module, p.pressure, p.backlash);
    const T = p.thickness;
    // planos 2D para achar a fase de cada planeta (engrena no sol e na coroa ao mesmo tempo)
    const sun2 = k(gearOutline(M, sunSpec));
    const planet2 = k(gearOutline(M, planetSpec));
    const cav2 = k(gearOutline(M, cavity));
    const ringR = gearRadii(cavity).ra + p.wall;
    const ring2 = k(k(M.CrossSection.circle(ringR, SEG * 2)).subtract(cav2));
    const pitch = (2 * Math.PI) / p.planet;
    // sobreposição (mm²) do planeta girado `rot` e levado a `pos` com o sol e a coroa; zero = engrena com folga
    const overlap = (rot: number, pos: [number, number], sunX: CS) => {
      const r = planet2.rotate(deg(rot));
      const q = r.translate(pos);
      const a = q.intersect(sunX), b = q.intersect(ring2);
      const v = a.area() + b.area();
      for (const o of [r, q, a, b]) o.delete();
      return v;
    };
    /** Fase do planeta: varredura grossa no passo do dente e refino em volta do melhor ponto. */
    const fitPlanet = (pos: [number, number], sunX: CS) => {
      const coarse = 60, fine = 24;
      let best = 0, bestV = Infinity;
      for (let s = 0; s < coarse; s++) {
        const v = overlap((pitch * s) / coarse, pos, sunX);
        if (v < bestV) {
          bestV = v;
          best = (pitch * s) / coarse;
        }
      }
      const span = pitch / coarse;
      for (let s = -fine; s <= fine; s++) {
        const rot = best + (span * s) / fine;
        const v = overlap(rot, pos, sunX);
        if (v < bestV) {
          bestV = v;
          best = rot;
        }
      }
      return { rot: best, v: bestV };
    };
    // a rotação do sol também entra: a fase em que um planeta engrena no sol e na coroa ao mesmo tempo depende da paridade dos dentes
    let sunRot = 0, sunBestV = Infinity;
    const first: [number, number] = [orbit, 0];
    for (let s = 0; s < 24; s++) {
      const rot = ((2 * Math.PI) / p.sun) * (s / 24);
      const x = sun2.rotate(deg(rot));
      const { v } = fitPlanet(first, x);
      x.delete();
      if (v < sunBestV) {
          sunBestV = v;
          sunRot = rot;
        }
    }
    const sunFit = k(sun2.rotate(deg(sunRot)));
    const planets: Solid[] = [];
    const pinR = Math.max(1.2, p.bore / 2 - 0.15);
    const carrierH = 3;
    const pins: Solid[] = [];
    for (let i = 0; i < n; i++) {
      const th = (2 * Math.PI * i) / n;
      const pos: [number, number] = [orbit * Math.cos(th), orbit * Math.sin(th)];
      const best = fitPlanet(pos, sunFit).rot;
      const body = k(k(k(k(planet2.rotate(deg(best))).extrude(T)).subtract(k(k(M.Manifold.cylinder(T + 2, p.bore / 2, p.bore / 2, 32)).translate([0, 0, -1])))).translate([pos[0], pos[1], 0]));
      planets.push(body);
      pins.push(k(k(M.Manifold.cylinder(carrierH + T - 0.4, pinR, pinR, 32)).translate([pos[0], pos[1], 0])));
    }
    // eixo do sol: sobe pelo furo do porta-satélites (que fica por cima dos planetas quando montado)
    const shaftR = p.bore / 2 + 2;
    const sunShaft = k(M.Manifold.cylinder(T + carrierH + 4, shaftR, shaftR, 48));
    const sunBody = k(k(M.Manifold.union([k(sunFit.extrude(T)), sunShaft])).subtract(k(k(M.Manifold.cylinder(T + carrierH + 6, p.bore / 2, p.bore / 2, 32)).translate([0, 0, -1]))));
    const ringBody = k(ring2.extrude(T));
    // impresso com o disco na mesa e os pinos para cima; montado, vira de cabeça para baixo sobre os planetas
    const carrierDisc = k(k(M.CrossSection.circle(orbit + p.module * 2, SEG)).subtract(k(M.CrossSection.circle(shaftR + 0.4, 48))));
    const carrier = k(M.Manifold.union([k(carrierDisc.extrude(carrierH)), ...pins]));
    const dx = ringR + gearRadii(planetSpec).ra + GAP;
    const spread = (s: Solid, ix: number, iy: number) => k(s.translate([ix * dx, iy * dx, 0]));
    const ratio = 1 + ringTeeth / p.sun;
    warnings.push(`Redutor ${br(ratio, 2)} : 1 (coroa parada, sol na entrada, porta-satélites na saída): sol ${p.sun}, ${n} planetas de ${p.planet}, coroa ${ringTeeth} dentes.`);
    const models = [
      { name: "Coroa", parts: [col("Coroa", p.color, ringBody)] },
      { name: "Sol", parts: [col("Sol", p.color, spread(sunBody, 1, 0))] },
      { name: "Planetas", parts: planets.map((s, i) => col(`Planeta ${i + 1}`, p.color, spread(s, 1, 1))) },
      { name: "Porta-satélites", parts: [col("Porta-satélites", p.carrierColor, spread(carrier, 0, 1))] },
    ];
    return { models, warnings };
  });
}
export type { CS };
