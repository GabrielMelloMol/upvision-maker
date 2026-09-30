import { fitSetOnBed, setOnBedWarning } from "../../geometry/bedLayout";
import { meshBounds } from "../../geometry/bounds";
import type { Model } from "../../geometry/types";
import type { ModelDef } from "./fields";

// ponytail: mesa de 256 mm (A1, P1, X1); aviso por impressora quando o app souber qual a pessoa usa
export const BED_MM = 256;
const fmt = (n: number) => String(Math.round(n));

/** Avisos de peça maior que a mesa (largura, profundidade ou altura), se o modelo ainda não avisou da mesa. */
export function bedWarnings(models: Model[], existing: string[]): string[] {
  if (existing.some((w) => /mesa/i.test(w))) return [];
  return models.flatMap((m) => {
    const b = meshBounds(m.parts.map((p) => p.mesh));
    if (!b) return [];
    const [w, d, h] = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
    if (Math.max(w, d) <= BED_MM && h <= BED_MM) return [];
    const why = h > BED_MM && Math.max(w, d) <= BED_MM ? `passa da altura de ${BED_MM} mm da impressora` : `passa da mesa de ${BED_MM} mm`;
    return [`"${m.name}" tem ${fmt(w)} × ${fmt(d)} × ${fmt(h)} mm e ${why}: diminua o tamanho.`];
  });
}

/** O modelo com a checagem de mesa na saída (vale para todos os Modelos prontos, no app e na varredura de QA). */
export function withBedCheck(def: ModelDef): ModelDef {
  return {
    ...def,
    build: (ctx, p) => {
      const out = def.build(ctx, p);
      const warnings = out.warnings ?? [];
      // peças arrumadas além da mesa: rearruma se der, senão avisa que vai em mais de uma mesa (#125)
      const models = fitSetOnBed(out.models);
      const bed = bedWarnings(models, warnings);
      const set = bed.length || warnings.some((w) => /mesa/i.test(w)) ? null : setOnBedWarning(models);
      return { ...out, models, warnings: [...warnings, ...bed, ...(set ? [set] : [])] };
    },
  };
}
