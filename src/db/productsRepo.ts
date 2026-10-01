import { z } from "zod";
import { Composition, ProductInput, type Product } from "../domain/products";
import { Variant } from "../domain/variants";
import { ownerOf, photos, type PhotoRow } from "./photosRepo";
import type { Db } from "./types";

type Row = Omit<Product, "composition" | "variants"> & { composition: string; variants: string };

const COLS = Object.keys(ProductInput.shape) as (keyof ProductInput)[];
export { MAX_PHOTOS } from "./photosRepo";

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
    await photos.removeOwner(db, ownerOf("product", id));
    await db.execute("DELETE FROM products WHERE id = ?", [id]);
  },
};

export type Photo = { id: number; productId: number; position: number; dataUrl: string };

/** Fotos do produto (#162: na tabela photos, dono "product:<id>"); mesma API de antes para o cadastro de produtos. */
const toPhoto = (r: PhotoRow): Photo => ({ id: r.id, productId: Number(r.owner.slice("product:".length)), position: r.position, dataUrl: r.dataUrl });
export const photosRepo = {
  list: async (db: Db, productId: number): Promise<Photo[]> => (await photos.list(db, ownerOf("product", productId))).map(toPhoto),
  /** Capas (1ª foto) de todos os produtos, para listas e catálogo. */
  covers: (db: Db) => photos.covers(db, "product"),
  async add(db: Db, productId: number, dataUrl: string): Promise<void> {
    await photos.add(db, ownerOf("product", productId), dataUrl);
  },
  remove: (db: Db, photoId: number) => photos.remove(db, photoId),
  /** Torna a foto a capa (posição 0) e empurra as outras. */
  makeCover: (db: Db, productId: number, photoId: number) => photos.makeCover(db, ownerOf("product", productId), photoId),
};
