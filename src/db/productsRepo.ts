import { z } from "zod";
import { Composition, ProductInput, type Product } from "../domain/products";
import { Variant } from "../domain/variants";
import type { Db } from "./types";

type Row = Omit<Product, "composition" | "variants"> & { composition: string; variants: string };

const COLS = Object.keys(ProductInput.shape) as (keyof ProductInput)[];
export const MAX_PHOTOS = 8;

function fromRow(r: Row): Product {
  let composition = { filaments: [], materials: [], items: [] } as Product["composition"];
  try {
    composition = Composition.parse(JSON.parse(r.composition));
  } catch (e) {
    console.error(`Composição inválida no produto ${r.id}:`, e);
  }
  let variants: Product["variants"] = [];
  try {
    variants = z.array(Variant).parse(JSON.parse(r.variants || "[]"));
  } catch (e) {
    console.error(`Variações inválidas no produto ${r.id}:`, e);
  }
  return { ...r, composition, variants };
}

// composição e variações ficam como JSON na linha
const values = (v: ProductInput) => COLS.map((c) => (c === "composition" || c === "variants" ? JSON.stringify(v[c]) : v[c]));

export const productsRepo = {
  async list(db: Db): Promise<Product[]> {
    return (await db.select<Row>("SELECT * FROM products ORDER BY name COLLATE NOCASE")).map(fromRow);
  },
  async insert(db: Db, input: unknown): Promise<number> {
    const v = ProductInput.parse(input);
    const r = await db.execute(`INSERT INTO products (${COLS.join(", ")}) VALUES (${COLS.map(() => "?").join(", ")})`, values(v));
    return Number(r.lastInsertId);
  },
  async update(db: Db, id: number, input: unknown): Promise<void> {
    const v = ProductInput.parse(input);
    await db.execute(`UPDATE products SET ${COLS.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...values(v), id]);
  },
  async remove(db: Db, id: number): Promise<void> {
    await db.execute("DELETE FROM product_photos WHERE productId = ?", [id]);
    await db.execute("DELETE FROM products WHERE id = ?", [id]);
  },
};

export type Photo = { id: number; productId: number; position: number; dataUrl: string };

export const photosRepo = {
  list: (db: Db, productId: number) => db.select<Photo>("SELECT * FROM product_photos WHERE productId = ? ORDER BY position, id", [productId]),
  /** Capas (1ª foto) de todos os produtos, para listas e catálogo. */
  async covers(db: Db): Promise<Record<number, string>> {
    const rows = await db.select<Photo>("SELECT * FROM product_photos ORDER BY productId, position, id");
    const out: Record<number, string> = {};
    for (const r of rows) out[r.productId] ??= r.dataUrl;
    return out;
  },
  async add(db: Db, productId: number, dataUrl: string): Promise<void> {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) throw new Error("Formato de foto não suportado.");
    const [{ n }] = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM product_photos WHERE productId = ?", [productId]);
    if (n >= MAX_PHOTOS) throw new Error(`Cada produto aceita até ${MAX_PHOTOS} fotos.`);
    await db.execute("INSERT INTO product_photos (productId, position, dataUrl) VALUES (?, ?, ?)", [productId, n, dataUrl]);
  },
  remove: (db: Db, photoId: number) => db.execute("DELETE FROM product_photos WHERE id = ?", [photoId]),
  /** Torna a foto a capa (posição 0) e empurra as outras. */
  async makeCover(db: Db, productId: number, photoId: number): Promise<void> {
    const photos = await photosRepo.list(db, productId);
    const ordered = [photos.find((p) => p.id === photoId)!, ...photos.filter((p) => p.id !== photoId)].filter(Boolean);
    for (const [i, p] of ordered.entries()) await db.execute("UPDATE product_photos SET position = ? WHERE id = ?", [i, p.id]);
  },
};
