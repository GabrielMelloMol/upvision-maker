import { nozzleText } from "../bed";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { toMesh } from "../mesh";
import { scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { fixThinStrokes } from "../stampArt";
import { inradius, stretchOf, type DomeGeo } from "./dome";
import { layoutRows } from "./layout";
import { buildFemaleSolid, buildMoldSolid, DEFAULT_MOLD, moldGap, type MoldParams } from "./mold";
import { domeWarp, mergeMeshes, REFINE_MM, warpOntoDome } from "./preview";
import { pressModel, pressMorph, pressStage, pressTravel, type PressFrame, type PressMorph } from "./press";
import { boltSolid, connectorHole, connectorSpec, nutSolid } from "./connector";
import { buildRims } from "./hinge";
import { clipRegion, DEFAULT_SCREEN, earHoleY, earOf, postTabOf, ringRegion, screenRegions, type ScreenParams, type ScreenRegions } from "./screen";
import { capSolid, DEFAULT_CAP, halfPost, postWidth, type CapSpec } from "./thread";
import { fitValue } from "../fits";
import { fitOrDefault } from "../testKit/catalog";

type K = <D extends { delete(): void }>(o: D) => D;

export type ThermoColors = { sheet: string; border: string; design: string; mold: string; clip: string; base: string };
const DEFAULT_COLORS: ThermoColors = { sheet: "#1f7a4d", border: "#1f7a4d", design: "#f4f4f2", mold: "#3b82f6", clip: "#1f7a4d", base: "#f4f4f2" };

/** Placas de base: "one" fecha o fundo de uma casca só (caixinha com tampa); "both" fecha as duas (enfeite oco). */
export type BaseMode = "none" | "one" | "both";

/** Folgas dos fechos, validadas no Kit de testes (#247): rosca do conector, pino da dobradiça e o avanço do gancho da trava. */
export type ThermoFit = { thread: number; hinge: number; latch: number };
const DEFAULT_FIT: ThermoFit = { thread: fitOrDefault({}, "threadClearance"), hinge: fitOrDefault({}, "hingeClearance"), latch: fitOrDefault({}, "latchReach") };

export type ThermoParams = {
  /** Altura do domo do molde e curvatura (expoente da superelipse). */
  domeH: number;
  curve: number;
  /** Encolhe o desenho da tela plana pelo esticamento, para sair do tamanho pedido depois de prensada. */
  compensate: boolean;
  mold: MoldParams;
  screen: ScreenParams;
  colors: ThermoColors;
  /** O desenho vai nas duas metades; senão, só na de cima. */
  designOnBoth: boolean;
  /** Engrossa os traços do desenho mais finos que o bico (sempre avisa). */
  thickenDesign: boolean;
  bases: BaseMode;
  baseT: number;
  /** O desenho também vai na base, visto através da malha. */
  baseArt: boolean;
  cap: CapSpec;
  fit: ThermoFit;
};

export const DEFAULT_THERMO: ThermoParams = { domeH: 10, curve: 2.2, compensate: true, mold: DEFAULT_MOLD, screen: DEFAULT_SCREEN, colors: DEFAULT_COLORS, designOnBoth: true, thickenDesign: true, bases: "none", baseT: 1.6, baseArt: false, cap: DEFAULT_CAP, fit: DEFAULT_FIT };

/** Parâmetros de partida da caixinha: os de fábrica, com as folgas que a pessoa validou no Kit de testes (#247). */
export const thermoDefaults = (): ThermoParams => ({
  ...DEFAULT_THERMO,
  screen: { ...DEFAULT_SCREEN, hole: fitValue("clipHole") },
  colors: { ...DEFAULT_THERMO.colors },
  mold: { ...DEFAULT_MOLD },
  cap: { ...DEFAULT_CAP, thread: { ...DEFAULT_CAP.thread } },
  fit: { thread: fitValue("threadClearance"), hinge: fitValue("hingeClearance"), latch: fitValue("latchReach") },
});

const EAR_RIM = 3; // material da orelha do conector em volta do furo

export type ThermoInfo = {
  /** Quanto a tela estica (comprimento do perfil do domo ÷ distância da borda ao topo). */
  stretch: number;
  /** Abertura da malha depois de esticada, no topo do domo (mm). */
  apertureAfter: number;
  /** Escala aplicada ao desenho da tela plana (1 = sem compensar). */
  designScale: number;
  /** Maior recuo do contorno: define até onde o domo sobe. */
  inradius: number;
  /** Folga do molde fêmea sobre o macho (espessura da tela + folga) e espessura que a tela fica no topo depois de esticar. */
  moldGap: number;
  thinTop: number;
  /** Placas de base que saem de fato (a tampa rosqueada exige as duas). */
  bases: BaseMode;
};

export type ThermoOut = {
  /** PLA 0,20: as duas telas, as bases e a faixa (aro) colada, em fileiras na mesa. */
  screens: Model[];
  /** PLA 0,16: o fecho (clipe ou tampa rosqueada), para a rosca sair limpa. */
  closure: Model[];
  /** PETG 0,24: molde macho e molde fêmea. */
  molds: Model[];
  /** A caixa montada e curvada (só prévia). */
  assembled: Model;
  /** Uma casca já prensada, com a base (só prévia). */
  shell: Model;
  /** O sanduíche fêmea, tela e macho no quadro pedido (só prévia; vazio se não pediu). */
  press: Model;
  /** A tela plana e a mesma malha já prensada, para animar (só com `press` e `morph`). */
  morph?: PressMorph;
  warnings: string[];
  info: ThermoInfo;
};

const GAP = 10;
const STRETCH_WARN = 1.4;
const THIN_TOP_WARN = 0.45;
const DESIGN_LOSS_WARN = 0.05;
const COMP_MIN = 0.6;
const COMP_SAMPLES = 8;
const MIN_DOME = 6;
const NECK_MM = 5; // pontas do miolo mais estreitas que 2 × isto não viram domo

const extruded = (cs: CS, height: number, k: K): Solid | null => (cs.isEmpty() ? null : k(cs.extrude(height)));
const solidPart = (name: string, color: string, s: Solid | null): Part[] => (s ? [{ name, color, mesh: toMesh(s) }] : []);

const maxRadius = (cs: CS) => Math.max(0, ...cs.toPolygons().flat().map(([x, y]) => Math.hypot(x, y)));

/** Encolhe o desenho pela média da ampliação do domo ao longo do desenho (do centro até a borda dele). */
function compensation(design: CS, magnification: (r: number) => number): number {
  const r = maxRadius(design);
  const mean = Array.from({ length: COMP_SAMPLES + 1 }, (_, i) => magnification((r * i) / COMP_SAMPLES)).reduce((a, b) => a + b, 0) / (COMP_SAMPLES + 1);
  return Math.min(1, Math.max(COMP_MIN, 1 / mean));
}

const scaled = (cs: CS, s: number, k: K) => (s === 1 ? cs : k(cs.scale(s)));

type Plate = { body: Solid | null; art: Solid | null; post: Solid | null };

/** Placa de base: a silhueta (com a orelha do clipe ou a aba do pino), o desenho em outra cor, nivelado, e o meio-pino da tampa. */
function plateOf(M: ManifoldToplevel, k: K, sil: CS, inner: CS, art: CS | null, hardware: CS | null, post: { y: number; s: 1 | -1 } | null, p: ThermoParams): Plate {
  const outline = hardware ? k(M.CrossSection.union([sil, hardware])) : sil;
  const artIn = art ? k(art.intersect(inner)) : null;
  const solidArt = artIn && !artIn.isEmpty() ? artIn : null;
  const body = solidArt ? k(outline.subtract(solidArt)) : outline;
  let pin: Solid | null = null;
  if (post) {
    const half = k(halfPost(M, k, p.cap.thread));
    const turned = post.s > 0 ? half : k(half.rotate([0, 0, 180]));
    pin = k(turned.translate([0, post.s * post.y, 0]));
  }
  return { body: extruded(body, p.baseT, k), art: solidArt ? extruded(solidArt, p.baseT, k) : null, post: pin };
}

/** Uma metade da caixa: a casca (3 regiões 2D) e, se houver, a base. */
type Half = { reg: ScreenRegions; plate: Plate | null };

/** Duas telas, as bases, o fecho e os moldes macho e fêmea (PETG), a partir da silhueta simétrica e do desenho de cima (já centrado, em mm). */
export function buildThermo(M: ManifoldToplevel, sil: CS, design: CS | null, p: ThermoParams, opts: { preview?: boolean; press?: PressFrame; morph?: boolean } = {}): ThermoOut {
  const preview = opts.preview ?? true;
  return scoped((k) => {
    const warnings: string[] = [];
    const inner = k(sil.offset(-p.screen.border, "Round")); // o miolo em malha: dentro da borda sólida
    // o domo nasce no limite interno da borda, sem as pontas finas do miolo (o pescoço da bola de Natal): elas ficam planas
    const base = k(k(inner.offset(-NECK_MM, "Round")).offset(NECK_MM, "Round"));
    const L = inradius(base);
    const H = Math.max(MIN_DOME, p.domeH);
    const g: DomeGeo = { L, H, q: p.curve };
    const { S, magnification } = stretchOf(g);
    const t = p.screen.t;
    const thinTop = t / S;
    if (S > STRETCH_WARN) warnings.push(`A tela estica ${S.toFixed(2).replace(".", ",")}× ao ser prensada: a malha abre demais e pode rasgar. Diminua a altura do domo ou use uma curvatura maior.`);
    else if (thinTop < THIN_TOP_WARN) warnings.push(`A tela fica com só ${thinTop.toFixed(2).replace(".", ",")} mm no topo depois de esticar: pode furar. Use uma tela mais grossa ou um domo mais baixo.`);
    const dScale = design && p.compensate ? compensation(design, magnification) : 1;
    let flatDesign = design ? scaled(design, dScale, k) : null;
    let plateDesign: CS | null = null;
    if (flatDesign) {
      // o traço fino conta na tela plana, já no tamanho que vai ser impresso
      const thin = fixThinStrokes(M, flatDesign, p.thickenDesign);
      flatDesign = k(thin.cs);
      if (thin.thin) warnings.push(thin.fixed ? "Havia traços do desenho mais finos que o bico da impressora e eu os engrossei para a tela sair inteira." : "O desenho tem traços mais finos que o bico da impressora: eles falham na tela. Engrosse o desenho ou aumente a caixinha.");
    }
    if (design && p.baseArt) plateDesign = k(fixThinStrokes(M, design, p.thickenDesign).cs);
    const lost = design && flatDesign ? 1 - k(flatDesign.intersect(inner)).area() / Math.max(1e-9, flatDesign.area()) : 0;
    if (lost > DESIGN_LOSS_WARN) warnings.push("O desenho passa da área da tela e foi cortado na borda: diminua o desenho ou aumente a silhueta.");

    // a tampa rosqueada precisa do meio-pino nas duas bases; o clipe, o conector e a faixa funcionam com ou sem base
    const fit = { ...DEFAULT_FIT, ...p.fit }; // sessões salvas antes do #273 não têm as folgas
    const cap = p.screen.closure === "cap";
    const connector = p.screen.closure === "connector";
    const hinge = p.screen.closure === "hinge";
    const bases: BaseMode = cap ? "both" : hinge ? "none" : p.bases;
    if (cap && p.bases !== "both") warnings.push("A tampa rosqueada precisa das bases nas duas metades (cada base leva metade do pino): liguei as duas bases.");
    if (hinge && p.bases !== "none") warnings.push("Na dobradiça, cada casca é colada no seu aro pela borda: as bases não entram.");
    const rims = hinge ? buildRims(M, k, sil, { t, border: p.screen.border, side: p.screen.side, hinge: fit.hinge, latch: fit.latch }) : null;
    const hasPlate = [bases !== "none", bases === "both"];
    const clip = p.screen.closure === "clip";
    const hole = connectorHole(fit.thread);
    const earScreen = connector ? { ...p.screen, hole, earW: hole + 2 * EAR_RIM } : p.screen;
    const ear = clip || connector ? earOf(M, sil, earScreen, k) : null;
    // o conector aperta as duas orelhas: cada uma é a tela ou, se houver, a base daquela metade
    const holder = (i: number) => (hasPlate[i] ? p.baseT : t);
    const conn = connector ? connectorSpec(fit.thread, holder(0) + holder(1)) : null;
    const tab = cap ? postTabOf(M, sil, p.screen, postWidth(p.cap.thread), k) : null;
    const wantDesign = [true, p.designOnBoth];

    const regs = new Map<string, ScreenRegions>();
    const regionsFor = (withDesign: boolean, withEar: boolean): ScreenRegions => {
      const key = `${withDesign}-${withEar}`;
      let r = regs.get(key);
      if (!r) {
        r = screenRegions(M, sil, withDesign ? flatDesign : null, p.screen, k, withEar ? ear : null);
        k(r.border); k(r.mesh); k(r.design);
        regs.set(key, r);
      }
      return r;
    };
    const halves: Half[] = [0, 1].map((i) => ({
      reg: regionsFor(wantDesign[i], !!ear && !hasPlate[i]),
      plate: hasPlate[i] ? plateOf(M, k, sil, inner, wantDesign[i] ? plateDesign : null, ear ?? tab?.tab ?? null, tab ? { y: tab.start, s: tab.s } : null, p) : null,
    }));

    const c = p.colors;
    const shellModel = (n: number, h: Half): Model => {
      const solid = (cs: CS) => extruded(cs, t, k);
      return { name: `Tela ${n}`, parts: [...solidPart("Borda", c.border, solid(h.reg.border)), ...solidPart("Malha", c.sheet, solid(h.reg.mesh)), ...(wantDesign[n - 1] ? solidPart("Design", c.design, solid(h.reg.design)) : [])] };
    };
    const plateParts = (pl: Plate, flip?: (s: Solid) => Solid): Part[] => {
      const f = (s: Solid | null) => (s && flip ? flip(s) : s);
      return [...solidPart("Base", c.base, f(pl.body)), ...solidPart("Arte", c.border, f(pl.art)), ...solidPart("Pino", c.base, f(pl.post))];
    };

    const rows: Model[][] = [halves.map((h, i) => shellModel(i + 1, h)), halves.flatMap((h, i) => (h.plate ? [{ name: `Base ${i + 1}`, parts: plateParts(h.plate) }] : []))];
    const closure: Model[] = [];
    if (clip) closure.push({ name: "Clipe", parts: solidPart("Clipe", c.clip, extruded(clipRegion(M, p.screen, k), p.screen.clipT, k)) });
    if (cap) closure.push({ name: "Tampa", parts: solidPart("Tampa", c.clip, k(capSolid(M, k, p.cap))) });
    if (rims) closure.push({ name: "Aros com dobradiça", parts: [...solidPart("Aro de cima", c.clip, rims.printA), ...solidPart("Aro de baixo", c.clip, rims.printB)] });
    if (conn) closure.push({ name: "Conector", parts: solidPart("Conector", c.clip, k(boltSolid(M, k, conn))) }, { name: "Porca", parts: solidPart("Porca", c.clip, k(nutSolid(M, k, conn))) });
    if (p.screen.closure === "ring") rows.push([{ name: "Faixa externa", parts: solidPart("Faixa", c.clip, extruded(ringRegion(sil, p.screen, k), p.screen.ringH, k)) }]);
    const screens = layoutRows(rows, GAP);
    const closureOut = layoutRows([closure], GAP);

    // moldes: o macho tem a parede que centraliza a tela (em volta do contorno da tela, com a orelha se ela ficar na casca)
    const shellOutline = ear && hasPlate.some((x) => !x) ? k(M.CrossSection.union([sil, ear])) : sil;
    const male = buildMoldSolid(M, base, g, p.mold, k, shellOutline, t);
    const female = buildFemaleSolid(M, base, g, p.mold, k, shellOutline, t);
    const molds = layoutRows([[{ name: "Molde macho", parts: [{ name: "Molde macho (de cima)", color: c.mold, mesh: toMesh(male) }] }, { name: "Molde fêmea", parts: [{ name: "Molde fêmea (de baixo)", color: c.mold, mesh: toMesh(female) }] }]], GAP);

    // caixa montada: a tela plana deformada sobre o domo (como a termoformagem faz), uma metade de cabeça para baixo sobre a outra
    // (a prévia é a parte mais cara: os testes e o QA do fatiador pedem sem ela)
    const emptyPreview = (name: string): Model => ({ name, previewOnly: true, parts: [] });
    let assembled = emptyPreview("Caixa montada (não imprime)");
    let shell = emptyPreview("Casca prensada (não imprime)");
    if (preview) {
      const warp = (cs: CS, lift: number): Solid | null => (cs.isEmpty() ? null : k(warpOntoDome(k(cs.extrude(t)), base, g, k).translate([0, 0, lift])));
      const mirror = (s: Solid) => k(s.mirror([0, 0, 1]));
      const warped = new Map<string, [Solid | null, Solid | null, Solid | null]>(); // as duas metades iguais deformam uma vez só
      const regKey = (h: Half) => [...regs.entries()].find(([, r]) => r === h.reg)![0] + (h.plate ? "-b" : "");
      const built = halves.map((h, i) => {
        const lift = h.plate ? p.baseT : 0;
        const fl = i ? mirror : undefined;
        const f = (s: Solid | null) => (s && fl ? fl(s) : s);
        let w = warped.get(regKey(h));
        if (!w) warped.set(regKey(h), (w = [warp(h.reg.border, lift), warp(h.reg.mesh, lift), warp(h.reg.design, lift)]));
        return {
          shell: [...solidPart("Borda", c.border, f(w[0])), ...solidPart("Malha", c.sheet, f(w[1])), ...(wantDesign[i] ? solidPart("Design", c.design, f(w[2])) : [])],
          plate: h.plate ? plateParts(h.plate, fl) : [],
        };
      });
      const merged = (name: string): Part[] => {
        const list = built.flatMap((b) => [...b.shell, ...b.plate]).filter((q) => q.name === name);
        return list.length ? [{ name, color: list[0].color, mesh: mergeMeshes(list.map((q) => q.mesh)) }] : [];
      };
      const assembledParts: Part[] = ["Borda", "Malha", "Design", "Base", "Arte", "Pino"].flatMap(merged);
      if (cap && tab) {
        // a tampa enroscada no pino: a abertura olha para a caixa e a alça sobe
        const onPin = k(k(k(capSolid(M, k, p.cap)).rotate([90, 0, 0])).translate([0, tab.start + p.cap.thread.length + p.cap.floor, 0]));
        assembledParts.push(...solidPart("Tampa", c.clip, tab.s > 0 ? onPin : k(onPin.rotate([0, 0, 180]))));
      }
      if (rims) assembledParts.push(...solidPart("Aro de cima", c.clip, rims.a), ...solidPart("Aro de baixo", c.clip, rims.b));
      if (conn) {
        // a cabeça do parafuso por baixo da metade de baixo; a porca, de boca para baixo, por cima, com a argola para fora
        const y = earHoleY(M, sil, earScreen, k);
        assembledParts.push(...solidPart("Conector", c.clip, k(k(boltSolid(M, k, conn)).translate([0, y, -(holder(1) + conn.headH)]))));
        let nut = k(k(nutSolid(M, k, conn)).rotate([180, 0, 0]));
        if (y > 0) nut = k(nut.rotate([0, 0, 180]));
        assembledParts.push(...solidPart("Porca", c.clip, k(nut.translate([0, y, holder(0) - nut.boundingBox().min[2]]))));
      }
      assembled = { name: "Caixa montada (não imprime)", previewOnly: true, parts: assembledParts };
      shell = { name: "Casca prensada (não imprime)", previewOnly: true, parts: [...built[0].shell, ...built[0].plate.filter((q) => q.name !== "Arte")] }; // sem a arte da base: vista pela malha ela parece um desenho fantasma
    }

    let press = emptyPreview("Como prensar (não imprime)");
    let morph: PressMorph | undefined;
    if (opts.press) {
      const stage = pressStage(opts.press);
      const shape = (cs: CS): Solid | null => (cs.isEmpty() ? null : stage.shape === 0 ? k(cs.extrude(t)) : warpOntoDome(k(cs.extrude(t)), base, g, k, stage.shape));
      const r = regionsFor(wantDesign[0], false);
      const sheet = opts.press === "section" ? [{ color: c.sheet, solid: shape(sil) }] : [{ color: c.border, solid: shape(r.border) }, { color: c.sheet, solid: shape(r.mesh) }, { color: c.design, solid: wantDesign[0] ? shape(r.design) : null, label: false }];
      const female = buildFemaleSolid(M, base, g, p.mold, k, shellOutline, t, true);
      const place = { male, female, flangeT: p.mold.flangeT, femaleTop: p.mold.flangeT + g.H + moldGap(t, p.mold) + p.mold.top, travel: pressTravel(g.H), moldColor: c.mold };
      press = pressModel(k, { ...place, frame: opts.press, sheet });
      if (opts.morph) {
        const flat = (cs: CS) => (cs.isEmpty() ? null : k(cs.extrude(t)));
        const pieces = [{ color: c.border, solid: flat(r.border) }, { color: c.sheet, solid: flat(r.mesh) }, { color: c.design, solid: wantDesign[0] ? flat(r.design) : null }];
        morph = pressMorph(k, { ...place, sheet: pieces, refine: REFINE_MM, warp: domeWarp(base, g) });
      }
    }

    const info: ThermoInfo = { stretch: S, apertureAfter: p.screen.aperture * S, designScale: dScale, inradius: L, moldGap: moldGap(t, p.mold), thinTop, bases };
    if (p.screen.aperture * S > 2 * p.screen.aperture) warnings.push(`A malha abre até ${(p.screen.aperture * S).toFixed(1).replace(".", ",")} mm depois de prensada (o furo de ${nozzleText(p.screen.aperture)} mm estica junto).`);
    return { screens, closure: closureOut, molds, assembled, shell, press, ...(morph && { morph }), warnings, info };
  });
}
