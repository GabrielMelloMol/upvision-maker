import { z } from "zod";
import type { Db } from "./types";

/** Variação salva pela pessoa num modelo pronto (#26): campos do modelo + camadas livres, em JSON. Entra no backup. */
export const ModelVariantInput = z.object({
  modelId: z.string().min(1),
  label: z.string().trim().min(1, "Dê um nome à variação.").max(60),
  data: z.string(),
  createdAt: z.string(),
});
export type ModelVariantInput = z.infer<typeof ModelVariantInput>;
export type ModelVariant = ModelVariantInput & { id: number };

const COLS = Object.keys(ModelVariantInput.shape);

export const modelVariants = {
  list: (db: Db, modelId: string) => db.select<ModelVariant>("SELECT * FROM model_variants WHERE modelId = ? ORDER BY id", [modelId]),
  async create(db: Db, input: ModelVariantInput): Promise<number> {
    const v = ModelVariantInput.parse(input) as Record<string, unknown>;
    const r = await db.execute(`INSERT INTO model_variants (${COLS.join(", ")}) VALUES (${COLS.map(() => "?").join(", ")})`, COLS.map((c) => v[c]));
    return Number(r.lastInsertId);
  },
  remove: (db: Db, id: number) => db.execute("DELETE FROM model_variants WHERE id = ?", [id]),
};
