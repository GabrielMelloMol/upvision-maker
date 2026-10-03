import { filaments, materials, printers } from "../../db/repo";
import type { Db } from "../../db/types";
import type { Composition } from "../../domain/products";
import type { Line } from "./saved";

/**
 * "Salvar como produto" com itens digitados à mão (auditoria de UX, C1). O produto só calcula o custo com filamento,
 * material e impressora cadastrados; antes, as linhas digitadas ficavam de fora e o produto saía com R$ 0,00. Agora
 * a calculadora oferece cadastrá-las (sem estoque nem aviso de mínimo) e usa os ids novos na composição.
 */
export type Typed = { filaments: { pricePerKg: number; grams: number }[]; materials: { unitPrice: number; qty: number }[]; watts: number | null };
export type Registered = { filamentIds: number[]; materialIds: number[]; printerId: number | null };
type Parse = (s: string) => number;

const typed = (ls: Line[], price: Parse, qty: Parse) => ls.filter((l) => !l.ref && price(l.price) > 0 && qty(l.qty) > 0);

/** Linhas sem item cadastrado que entram no custo, e a potência digitada sem impressora escolhida. */
export function typedItems(fil: Line[], ext: Line[], printerId: string, watts: string, price: Parse, qty: Parse): Typed {
  return {
    filaments: typed(fil, price, qty).map((l) => ({ pricePerKg: price(l.price), grams: qty(l.qty) })),
    materials: typed(ext, price, qty).map((l) => ({ unitPrice: price(l.price), qty: qty(l.qty) })),
    watts: !printerId && qty(watts) > 0 ? qty(watts) : null,
  };
}

export const hasTyped = (t: Typed) => t.filaments.length > 0 || t.materials.length > 0 || t.watts !== null;

/** Cadastra o que foi digitado e devolve os ids na ordem das linhas. `name` identifica de onde veio (o nome da peça). */
export async function registerTyped(db: Db, t: Typed, name: string): Promise<Registered> {
  const from = `Da calculadora${name ? ` · ${name}` : ""}`.slice(0, 80);
  const filamentIds: number[] = [];
  for (const f of t.filaments) filamentIds.push(await filaments.insert(db, { material: "Filamento", color: "", brand: from, pricePerKg: f.pricePerKg, spoolG: 1000, stockG: 0, minG: 0, td: null }));
  const materialIds: number[] = [];
  for (const [i, m] of t.materials.entries()) materialIds.push(await materials.insert(db, { name: `${from} · item ${i + 1}`, unit: "un", unitPrice: m.unitPrice, stock: 0, min: 0 }));
  const printerId = t.watts !== null ? await printers.insert(db, { name: "Impressora da calculadora", watts: t.watts }) : null;
  return { filamentIds, materialIds, printerId };
}

/** Composição do produto: as linhas cadastradas e, se `ids` vier, as digitadas com os ids novos (mesma ordem de `typedItems`). */
export function draftComposition(fil: Line[], ext: Line[], price: Parse, qty: Parse, ids: Registered | null): Composition {
  const take = (ls: Line[], newIds: number[] = []) => {
    const rest = [...newIds];
    return ls.flatMap((l) => {
      if (!(qty(l.qty) > 0)) return [];
      if (l.ref) return [{ id: Number(l.ref), q: qty(l.qty) }];
      if (!ids || !(price(l.price) > 0)) return [];
      const id = rest.shift();
      return id ? [{ id, q: qty(l.qty) }] : [];
    });
  };
  return {
    filaments: take(fil, ids?.filamentIds).map(({ id, q }) => ({ filamentId: id, grams: q })),
    materials: take(ext, ids?.materialIds).map(({ id, q }) => ({ materialId: id, qty: q })),
    items: [],
  };
}
