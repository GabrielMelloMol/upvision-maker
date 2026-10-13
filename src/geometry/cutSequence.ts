import { fitSetOnBed, setOnBedWarning } from "./bedLayout";
import type { ManifoldToplevel } from "./manifold";
import { partialCut, type CutReport, type PartialCutOptions } from "./partialCut";
import { spread } from "./planeCut";
import type { Model, Part } from "./types";

/**
 * Vários cortes parciais no mesmo arquivo: cada um vale no que sobrou do anterior (o resto), com a sua região, plano,
 * encaixe e cor do pedaço; sai um objeto por pedaço, mais o resto e os pinos, todos num 3MF.
 */
export type CutItem = PartialCutOptions & {
  /** Filamento do pedaço (hex): vira o extrusor do objeto no 3MF. `null` = mantém as cores do arquivo. */
  color: string | null;
};
export type CutPlan = { cuts: CutItem[]; restColor: string | null };

/** Cores de destaque dos pedaços na prévia (quando nenhuma foi escolhida). */
export const PIECE_PALETTE = ["#f97316", "#a855f7", "#22c55e", "#ec4899", "#eab308", "#06b6d4"];
const BED_WARNING = "não cabem juntas na mesa";

const paint = (parts: Part[], color: string | null): Part[] => (color ? parts.map((p) => ({ ...p, color })) : parts);

export function runCuts(M: ManifoldToplevel, model: Model, plan: CutPlan): { models: Model[]; preview: Model[]; warnings: string[]; report: CutReport } {
  const many = plan.cuts.length > 1;
  const warnings: string[] = [];
  const pieces: Model[] = [];
  const pins: Model[] = [];
  const preview: Model[] = [];
  let cur = model;
  let rest: Model | null = null;
  let report: CutReport = { original: 0, sum: 0, ok: true };
  plan.cuts.forEach((cut, i) => {
    const tag = many ? ` ${i + 1}` : "";
    let r;
    try {
      r = partialCut(M, cur, cut);
    } catch (e) {
      throw many ? new Error(`Corte ${i + 1}: ${(e as Error).message}`, { cause: e }) : e;
    }
    for (const m of r.models) {
      if (m.name.endsWith("pedaço")) pieces.push({ ...m, name: `${model.name} · pedaço${tag}`, parts: paint(m.parts, cut.color) });
      else if (m.name.endsWith("pinos")) pins.push({ ...m, name: `${model.name} · pinos${tag}` });
      else rest = m;
    }
    const color = cut.color ?? PIECE_PALETTE[i % PIECE_PALETTE.length];
    const piece = r.preview.find((m) => m.name === "Pedaço")!;
    preview.push({ name: `Pedaço${tag}`, parts: piece.parts.map((p, j) => ({ ...p, color, name: piece.parts.length > 1 ? `Pedaço${many ? ` ${i + 1}` : ""}.${j + 1}` : `Pedaço${tag}` })) });
    for (const m of r.preview) if (m.name === "Plano de corte" || m.name === "Região") preview.push(m);
    cur = { name: model.name, parts: r.preview.find((m) => m.name === "Resto")!.parts };
    warnings.push(...r.warnings.filter((w) => !w.includes(BED_WARNING)).map((w) => (many ? `Corte ${i + 1}: ${w}` : w)));
    report = i === 0 ? r.report : { original: report.original, sum: report.sum + (r.report.sum - r.report.original), ok: report.ok && r.report.ok };
  });
  const restModel = { ...rest!, name: `${model.name} · resto`, parts: paint(rest!.parts, plan.restColor) };
  preview.unshift({ name: "Resto", parts: paint(cur.parts, plan.restColor) });
  const placed = fitSetOnBed(spread([restModel, ...pieces, ...pins]));
  const set = setOnBedWarning(placed);
  if (set) warnings.push(set);
  return { models: placed, preview, warnings, report };
}
