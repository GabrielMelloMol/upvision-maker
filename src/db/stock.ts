import { invoke } from "@tauri-apps/api/core";
import type { ConsumptionPlan } from "../domain/products";
import { DB_URL } from "./index";

export type Movement = { kind: "filament" | "material" | "product"; id: number; delta: number };
export type OrderChange = { orderId: number; expectApplied: boolean; setApplied: boolean; status: string; note: string };

/** Plano de consumo → movimentos. `sign` -1 dá baixa; +1 estorna. */
export function planToMovements(plan: ConsumptionPlan, sign: 1 | -1): Movement[] {
  const out: Movement[] = [];
  const push = (kind: Movement["kind"], rec: Record<number, number>) => {
    for (const [id, q] of Object.entries(rec)) if (q) out.push({ kind, id: Number(id), delta: sign * q });
  };
  push("filament", plan.filaments);
  push("material", plan.materials);
  push("product", plan.products);
  return out;
}

/** Aplica tudo numa única transação no Rust (src-tauri/src/stock.rs). */
export const applyStock = (movements: Movement[], order?: OrderChange) => invoke<void>("apply_stock", { dbUrl: DB_URL, movements, order: order ?? null });
