import { bedHeight, bedMm } from "../../geometry/bed";
import { fitSetOnBed, setOnBedWarning } from "../../geometry/bedLayout";
import { meshBounds } from "../../geometry/bounds";
import type { Model } from "../../geometry/types";
import type { ModelDef } from "./fields";

const fmt = (n: number) => String(Math.round(n));

/** Avisos de peça maior que a mesa (largura, profundidade ou altura), se o modelo ainda não avisou da mesa. */
export function bedWarnings(models: Model[], existing: string[]): string[] {
  if (existing.some((w) => /mesa/i.test(w))) return [];
  return models.flatMap((m) => {
    const b = meshBounds(m.parts.map((p) => p.mesh));
    if (!b) return [];
    const [w, d, h] = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
    // mesa e altura da impressora escolhida (#119)
    if (Math.max(w, d) <= bedMm() && h <= bedHeight()) return [];
    const why = h > bedHeight() && Math.max(w, d) <= bedMm() ? `passa da altura de ${bedHeight()} mm da impressora` : `passa da mesa de ${bedMm()} mm`;
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
