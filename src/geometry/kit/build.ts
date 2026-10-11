import { bedMm, nozzleMm, nozzleText } from "../bed";
import { meshBounds } from "../bounds";
import type { CS, ManifoldToplevel, Solid } from "../manifold";
import { MissingInput, solidMesh, type ModelCtx, type ModelOutput } from "../models/common";
import { fitInto, scoped } from "../shape2d";
import type { Model, Part } from "../types";
import { KitFitError, layoutSheet, type SheetSize } from "./sheet";
import type { K, KitBuild, KitEnv, KitPair, KitParams, KitPart, KitTemplate, Placement } from "./types";

/** Parâmetros que todo kit tem (nome, cartão, espessura, folga, escala, cores da moldura e arte em relevo). */
export const DEFAULT_KIT_COMMON: KitParams = {
  title: "", cardSize: "large", compact: true, copies: 1, scale: 1, thickness: 1.6, fit: 0.2, pinFit: 0.15, spin: 0.3,
  gap: 2.5, frame: 2.5, runner: 4, engrave: 0.6, showAssembled: true, frameColor: "#f4f4f2", titleColor: "#1c1c1e",
  artPart: "", artFace: "front", artSize: 60, artRelief: 0.4, c_art: "#c0392b",
};

/** Padrões do modelo: os do kit, as cores da paleta (`c_<chave>`) e os do próprio modelo. */
export function kitDefaults(tpl: KitTemplate): KitParams {
  return { ...DEFAULT_KIT_COMMON, ...Object.fromEntries(tpl.palette.map((c) => [`c_${c.key}`, c.default])), ...tpl.defaults };
}

const CARD_GAP = 3;
const num = (p: KitParams, k: string) => Number(p[k]);

/** Uma peça pronta para o cartão e para o montado. */
type Inst = { id: string; index: number; count: number; number: number; part: KitPart; thickness: number; flip: boolean };

/** Regiões de cada cor de uma peça: no plano do cartão (`print`) ou na orientação do montado. */
function colorSolids(M: ManifoldToplevel, k: K, q: Inst, orient: "print" | "assembly"): Map<string, Solid[]> {
  const t = q.thickness;
  const mirror = orient === "print" && q.flip;
  const out = new Map<string, Solid[]>();
  const add = (color: string, s: Solid) => out.set(color, [...(out.get(color) ?? []), s]);
  for (const l of q.part.layers) {
    let cs = l.cs;
    if (mirror) cs = k(cs.mirror([1, 0]));
    let [z0, z1] = l.z ?? [0, t];
    if (mirror && z1 <= 0) [z0, z1] = [t, t + (z1 - z0)]; // relevo atrás vira relevo em cima na peça virada
    if (cs.isEmpty()) continue;
    add(l.color, k(k(cs.extrude(z1 - z0)).translate([0, 0, z0])));
  }
  for (const pin of q.part.pins ?? []) {
    const cyl = k(M.Manifold.cylinder(pin.len, pin.r, pin.r, 32, false));
    add(pin.color ?? q.part.layers[0].color, k(cyl.translate([mirror ? -pin.x : pin.x, pin.y, t - 0.01])));
  }
  return out;
}

const outlineOf = (M: ManifoldToplevel, k: K, q: Inst, flip: boolean): CS => {
  const cs = k(M.CrossSection.union(q.part.layers.filter((l) => !l.z).map((l) => l.cs)));
  return flip ? k(cs.mirror([1, 0])) : cs;
};

/** "4", "4 a 7" ou "1, 3" a partir dos números de uma peça. */
export function formatNumbers(ns: number[]): string {
  const s = [...ns].sort((a, b) => a - b);
  if (!s.length) return "?";
  if (s.length === 1) return String(s[0]);
  return s.every((n, i) => i === 0 || n === s[i - 1] + 1) ? `${s[0]} a ${s[s.length - 1]}` : s.join(", ");
}

const instName = (q: Pick<Inst, "id" | "index" | "count">) => (q.count > 1 ? `${q.id}#${q.index}` : q.id);

/** O montado: cada peça posicionada pela sua matriz (gira e move). Devolve os sólidos por instância (cor → sólido). */
export function assemblySolids(M: ManifoldToplevel, k: K, insts: Inst[], assembly: Placement[]): { name: string; id: string; index: number; colors: Map<string, Solid> }[] {
  const out: { name: string; id: string; index: number; colors: Map<string, Solid> }[] = [];
  const used = new Map<string, number>();
  for (const pl of assembly) {
    const matches = insts.filter((q) => q.id === pl.part);
    if (!matches.length) throw new Error(`Montagem usa a peça "${pl.part}", que não existe.`);
    const n = pl.index ?? (used.get(pl.part) ?? 0) + 1;
    used.set(pl.part, n);
    const q = matches.find((m) => m.index === n);
    if (!q) throw new Error(`Montagem usa "${pl.part}" nº ${n}, mas o kit só tem ${matches.length}.`);
    const colors = new Map<string, Solid>();
    for (const [c, list] of colorSolids(M, k, q, "assembly")) {
      const u = list.length > 1 ? k(M.Manifold.union(list)) : list[0];
      colors.set(c, k(k(u.rotate(pl.rotate ?? [0, 0, 0])).translate(pl.translate)));
    }
    out.push({ name: instName(q), id: q.id, index: q.index, colors });
  }
  return out;
}

export type PairReport = { a: string; b: string; kind: KitPair["kind"]; gap: number; ok: boolean };
export type AssemblyReport = { collisions: { a: string; b: string; volume: number }[]; pairs: PairReport[] };

const matchesName = (spec: string, name: string, id: string) => spec === name || spec === id;

/**
 * Confere o montado: sobreposição entre peças que NÃO são um par declarado (pino × furo, aba × janela, fenda × fenda) e a folga
 * dos pares declarados (≤ a folga esperada + `tol`). Um par que se sobrepõe de verdade também é colisão.
 */
export function checkAssembly(M: ManifoldToplevel, k: K, sol: ReturnType<typeof assemblySolids>, pairs: KitPair[], fit: number, tol = 0.08, maxOverlap = 1e-3): AssemblyReport {
  const whole = sol.map((s) => ({ ...s, solid: s.colors.size > 1 ? k(M.Manifold.union([...s.colors.values()])) : [...s.colors.values()][0] }));
  const collisions: AssemblyReport["collisions"] = [];
  const pairReports: PairReport[] = [];
  for (let i = 0; i < whole.length; i++)
    for (let j = i + 1; j < whole.length; j++) {
      const [a, b] = [whole[i], whole[j]];
      const vol = k(a.solid.intersect(b.solid)).volume();
      if (vol > maxOverlap) collisions.push({ a: a.name, b: b.name, volume: vol });
      const declared = pairs.find((p) => (matchesName(p.a, a.name, a.id) && matchesName(p.b, b.name, b.id)) || (matchesName(p.a, b.name, b.id) && matchesName(p.b, a.name, a.id)));
      if (declared) {
        const gap = vol > maxOverlap ? 0 : a.solid.minGap(b.solid, (declared.gap ?? fit) + 1);
        pairReports.push({ a: a.name, b: b.name, kind: declared.kind, gap, ok: vol <= maxOverlap && gap <= (declared.gap ?? fit) + tol });
      }
    }
  return { collisions: collisions.filter((c) => !pairs.some((p) => (matchesName(p.a, c.a, c.a.split("#")[0]) && matchesName(p.b, c.b, c.b.split("#")[0])) || (matchesName(p.a, c.b, c.b.split("#")[0]) && matchesName(p.b, c.a, c.a.split("#")[0])))), pairs: pairReports };
}

export type KitMeta = {
  card: { w: number; h: number };
  cardSize: SheetSize;
  pieces: number;
  gatesPerPiece: number[];
  /** peça (id) → números gravados */
  numbers: Record<string, number[]>;
  build: KitBuild;
};

const moveXY = (m: { positions: Float32Array; indices: Uint32Array }, dx: number, dy = 0) => {
  const pos = m.positions.slice();
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] += dx;
    pos[i + 1] += dy;
  }
  return { positions: pos, indices: m.indices };
};

/** Arte do usuário em relevo (em cima ou atrás) na peça escolhida, recortada para ficar dentro do contorno. */
function embossArt(M: ManifoldToplevel, k: K, part: KitPart, art: CS, p: KitParams, t: number): { part: KitPart; flip: boolean; warning?: string } {
  const outline = k(M.CrossSection.union(part.layers.filter((l) => !l.z).map((l) => l.cs)));
  const b = outline.bounds();
  const [w, h] = [b.max[0] - b.min[0], b.max[1] - b.min[1]];
  const size = num(p, "artSize") / 100, relief = num(p, "artRelief");
  const back = p.artFace === "back";
  if (back && part.pins?.length) return { part, flip: false, warning: `A peça "${part.label}" tem pino: a arte vai na face de cima (a de trás não imprime com pino).` };
  const fitted = k(fitInto(k(art.translate([0, 0])), w * size, h * size, 0));
  const inside = k(fitted.translate([(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]));
  const clipped = k(inside.intersect(k(outline.offset(-0.6, "Round"))));
  if (clipped.isEmpty()) return { part, flip: false, warning: "A arte não coube dentro da peça escolhida." };
  const z: [number, number] = back ? [-relief, 0] : [t, t + relief];
  return { part: { ...part, layers: [...part.layers, { cs: clipped, color: "art", z }] }, flip: back };
}

/**
 * Monta o kit de um modelo: o cartão (moldura, galhos, pontos de corte, nome e números), as peças em cores, e o montado ao lado
 * (só prévia). `tpl.build` desenha as peças planas; aqui entram arrumação, personalização e verificações.
 */
export function buildKitTemplate(ctx: ModelCtx, tpl: KitTemplate, params: KitParams): ModelOutput & { meta?: KitMeta } {
  const p: KitParams = { ...kitDefaults(tpl), ...params };
  try {
    return buildOnce(ctx, tpl, p);
  } catch (e) {
    if (!(e instanceof KitFitError)) throw e;
  }
  // não coube nem na mesa inteira: reduz o tamanho (busca binária) até caber, e avisa; só falha se nem o mínimo couber
  const asked = num(p, "scale");
  let lo = MIN_SCALE, hi = asked;
  const tryScale = (scale: number) => {
    try {
      return buildOnce(ctx, tpl, { ...p, scale });
    } catch (e) {
      if (e instanceof KitFitError) return null;
      throw e;
    }
  };
  let best = lo < hi ? tryScale(lo) : null;
  if (!best) throw new KitFitError("As peças não cabem nem na mesa inteira, mesmo no menor tamanho: escolha medidas menores.");
  let used = lo;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    const r = tryScale(mid);
    if (r) [lo, used, best] = [mid, mid, r];
    else hi = mid;
  }
  const fmtX = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
  return { ...best, warnings: [`Reduzi o tamanho do modelo de ${fmtX(asked)}× para ${fmtX(used)}× para as peças caberem na mesa inteira.`, ...(best.warnings ?? [])] };
}

const MIN_SCALE = 0.3;

function buildOnce(ctx: ModelCtx, tpl: KitTemplate, p: KitParams): ModelOutput & { meta?: KitMeta } {
  const { M, text, art } = ctx;
  const t = num(p, "thickness");
  return scoped((k) => {
    const env: KitEnv = { M, k, t, fit: num(p, "fit"), pinFit: num(p, "pinFit"), scale: num(p, "scale"), p };
    const kb = tpl.build(env);
    const warnings: string[] = [...(kb.warnings ?? [])];
    const palette = [...tpl.palette, { key: "art", label: "Arte", default: String(p.c_art) }];
    const colorHex = (key: string) => String(p[`c_${key}`] ?? palette.find((c) => c.key === key)?.default ?? "#cccccc");
    const labelOf = (key: string) => palette.find((c) => c.key === key)?.label ?? key;

    // instâncias numeradas, com a arte em relevo na peça escolhida
    const insts: Inst[] = [];
    let number = 0;
    for (const base of kb.parts) {
      let part = base, flip = false;
      if (p.artPart === base.id && art && !art.isEmpty()) {
        const r = embossArt(M, k, base, art, p, base.thickness ?? t);
        part = r.part;
        flip = r.flip;
        if (r.warning) warnings.push(r.warning);
      }
      const count = Math.max(1, base.count ?? 1);
      for (let i = 1; i <= count; i++) insts.push({ id: base.id, index: i, count, number: ++number, part, thickness: base.thickness ?? t, flip });
    }
    if (!insts.length) throw new MissingInput("O modelo não tem peças.");

    // o cartão
    const outlines = insts.map((q) => outlineOf(M, k, q, q.flip));
    const sheet = layoutSheet(M, k, outlines, { cardSize: p.cardSize as SheetSize, compact: Boolean(p.compact), gap: num(p, "gap"), frame: num(p, "frame"), runner: num(p, "runner"), engrave: num(p, "engrave"), t, title: String(p.title ?? ""), numbers: insts.map((q) => q.number), text });
    if (sheet.cardSize !== p.cardSize) warnings.push(`As peças não cabem no cartão pedido: usei o cartão ${{ credit: "de crédito", medium: "médio", large: "grande", xlarge: "maior", bed: "da mesa inteira" }[sheet.cardSize]} (${Math.round(sheet.W)} × ${Math.round(sheet.H)} mm).`);
    const byColor = new Map<string, Solid[]>();
    insts.forEach((q, i) => {
      for (const [c, list] of colorSolids(M, k, q, "print")) byColor.set(c, [...(byColor.get(c) ?? []), ...list.map((s) => k((sheet.offsets[i].rotated ? k(s.rotate([0, 0, 90])) : s).translate([sheet.offsets[i].dx, sheet.offsets[i].dy, 0])))]);
    });
    const parts: Part[] = [{ name: "Cartão", color: String(p.frameColor), mesh: solidMesh(sheet.card) }];
    for (const c of palette) {
      const list = byColor.get(c.key);
      if (list?.length) parts.push({ name: c.label, color: colorHex(c.key), mesh: solidMesh(k(M.Manifold.union(list))) });
    }
    if (sheet.inlay) parts.push({ name: "Título", color: String(p.titleColor), mesh: solidMesh(sheet.inlay) });

    // avisos
    const nozzle = nozzleMm();
    const few = sheet.gatesPerPiece.filter((n) => n < 2).length;
    if (few) warnings.push(`${few} peça(s) ficaram com menos de 2 pontos de corte: diminua o espaço entre as peças.`);
    for (const q of insts.filter((x) => x.index === 1)) {
      const cs = outlineOf(M, k, q, false);
      const opened = k(k(cs.offset(-nozzle / 2, "Round")).offset(nozzle / 2, "Round"));
      if (cs.area() - opened.area() > cs.area() * 0.04) warnings.push(`A peça "${q.part.label}" tem partes mais finas que o bico (${nozzleText()} mm): elas somem na impressão. Aumente o tamanho do modelo.`);
    }
    if (num(p, "frame") < 4 * nozzle) warnings.push(`Moldura de ${String(p.frame).replace(".", ",")} mm é fina para o bico de ${nozzleText()} mm: alargue para o cartão ficar firme.`);
    const numbers: Record<string, number[]> = {};
    for (const q of insts) numbers[q.id] = [...(numbers[q.id] ?? []), q.number];
    warnings.push(`Para montar: destaque as peças dobrando os pontos de corte. ${kb.steps.map((s) => s.replace(/\{([^}]+)\}/g, (_, id: string) => formatNumbers(numbers[id] ?? []))).join(" ")}`);

    // mesa: vários cartões
    const { W, H } = sheet;
    const bed = bedMm();
    const fitCols = Math.max(1, Math.floor((bed + CARD_GAP) / (W + CARD_GAP)));
    const fitRows = Math.max(1, Math.floor((bed + CARD_GAP) / (H + CARD_GAP)));
    const asked = Math.max(1, Math.round(num(p, "copies")));
    const copies = Math.min(asked, fitCols * fitRows);
    const fmtMm = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
    if (copies < asked) warnings.push(`Só ${copies} cartão(ões) de ${fmtMm(W)} × ${fmtMm(H)} mm cabem juntos numa mesa de ${bed} mm (você pediu ${asked}): escolha um cartão menor para caber mais.`);
    const cols = Math.min(copies, fitCols);
    const rowsN = Math.ceil(copies / cols);
    const models: Model[] = Array.from({ length: copies }, (_, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const dx = (c - (cols - 1) / 2) * (W + CARD_GAP), dy = ((rowsN - 1) / 2 - r) * (H + CARD_GAP);
      return { name: copies > 1 ? `${tpl.label} ${i + 1}` : tpl.label, parts: parts.map((q) => ({ ...q, mesh: moveXY(q.mesh, dx, dy) })) };
    });

    // montado (só prévia)
    if (p.showAssembled) {
      const sol = assemblySolids(M, k, insts, kb.assembly);
      const asmParts: Part[] = sol.flatMap((s) => [...s.colors].map(([c, solid], i) => ({ name: `Montado: ${s.name}${i ? ` (${labelOf(c)})` : ""}`, color: colorHex(c), mesh: solidMesh(solid) })));
      const box = meshBounds(asmParts.map((q) => q.mesh));
      if (box) {
        const shift = (cols * (W + CARD_GAP) - CARD_GAP) / 2 + 12 - box.min[0];
        const raise = -box.min[2];
        models.push({ name: "Montado", previewOnly: true, parts: asmParts.map((q) => ({ ...q, mesh: moveXYZ(q.mesh, shift, 0, raise) })) });
      }
    }
    const meta: KitMeta = { card: { w: W, h: H }, cardSize: sheet.cardSize, pieces: insts.length, gatesPerPiece: sheet.gatesPerPiece, numbers, build: kb };
    return { models, warnings, meta };
  });
}

function moveXYZ(m: { positions: Float32Array; indices: Uint32Array }, dx: number, dy: number, dz: number) {
  const pos = m.positions.slice();
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] += dx;
    pos[i + 1] += dy;
    pos[i + 2] += dz;
  }
  return { positions: pos, indices: m.indices };
}

/** Peças numeradas e montado de um kit, sem cartão: para testes e para a bateria de qualquer modelo. */
export function kitInstances(M: ManifoldToplevel, k: K, tpl: KitTemplate, params: KitParams): { insts: Inst[]; build: KitBuild; env: KitEnv } {
  const p: KitParams = { ...kitDefaults(tpl), ...params };
  const t = num(p, "thickness");
  const env: KitEnv = { M, k, t, fit: num(p, "fit"), pinFit: num(p, "pinFit"), scale: num(p, "scale"), p };
  const build = tpl.build(env);
  const insts: Inst[] = [];
  let n = 0;
  for (const part of build.parts) for (let i = 1; i <= Math.max(1, part.count ?? 1); i++) insts.push({ id: part.id, index: i, count: Math.max(1, part.count ?? 1), number: ++n, part, thickness: part.thickness ?? t, flip: false });
  return { insts, build, env };
}
