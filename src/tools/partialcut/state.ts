import type { Bounds } from "../../geometry/bounds";
import type { CutItem } from "../../geometry/cutSequence";
import { regionOfKind } from "../../geometry/cutRegion";
import { DEFAULT_PARTIAL_CUT, planeNormal, type Vec3 } from "../../geometry/partialCut";

/** Um corte na tela: as opções do corte mais se a região vale (`limit`) ou o plano atravessa a peça toda. */
export type UiCut = CutItem & { limit: boolean };
export type Pick = "center" | "island" | "plane";
export type CutState = { file: { name: string; bytes: Uint8Array } | null; cuts: UiCut[]; active: number; pick: Pick; restColor: string | null };

export const newCut = (): UiCut => ({ ...DEFAULT_PARTIAL_CUT, color: null, limit: true });
export const initialState = (): CutState => ({ file: null, cuts: [newCut()], active: 0, pick: "center", restColor: null });

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Alcance do plano ao longo da normal: do canto mais baixo ao mais alto da peça. */
export function planeRange(b: Bounds, n: Vec3): [number, number] {
  const d = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => dot(n, [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]));
  return [Math.floor(Math.min(...d)), Math.ceil(Math.max(...d))];
}

/** Opções de um corte prontas para o motor: plano dentro da peça e região só se ligada. */
export function cutForEngine(c: UiCut, b: Bounds): CutItem {
  const [lo, hi] = planeRange(b, planeNormal(c.axis, c.tilt));
  const { limit, ...rest } = c;
  return { ...rest, offset: clamp(c.offset, lo, hi), region: limit ? c.region : null };
}

/** Projetos guardados: a 1ª versão tinha um corte só (`opts` + `limit`, com `box` antes da região em forma). */
export function migrate(raw: Record<string, unknown>): Omit<CutState, "file"> {
  const base = initialState();
  if (Array.isArray(raw.cuts)) return { cuts: raw.cuts as UiCut[], active: Number(raw.active ?? 0), pick: (raw.pick as Pick) ?? base.pick, restColor: (raw.restColor as string | null) ?? null };
  const opts = (raw.opts ?? {}) as Partial<UiCut> & { box?: { min: Vec3; max: Vec3 } };
  const region = opts.region ?? (opts.box ? { kind: "box" as const, ...opts.box } : null);
  return { ...base, cuts: [{ ...newCut(), ...opts, region, limit: raw.limit !== false }], pick: (raw.pick as Pick) ?? base.pick };
}

/** Região de partida de um corte novo: a caixa da peça toda, plano no meio. */
export function freshCut(b: Bounds): UiCut {
  const [lo, hi] = planeRange(b, planeNormal("z", 0));
  return { ...newCut(), offset: (lo + hi) / 2, region: regionOfKind("box", { min: b.min, max: b.max }) };
}

/** Corte novo: o plano um quarto acima da base, abaixo de onde o 1º costuma passar (o novo vale no que sobrou). */
export function addedCut(b: Bounds): UiCut {
  const c = freshCut(b);
  const [lo, hi] = planeRange(b, planeNormal("z", 0));
  return { ...c, offset: lo + (hi - lo) * 0.25 };
}
