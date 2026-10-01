import { z } from "zod";
import type { Db } from "./types";

/**
 * Fotos reais (#162): uma tabela para todos os donos — produto, projeto (Meus projetos) e impressão (ficha, #163).
 * A 1ª (posição 0) é a capa. Guardadas como data URL JPEG/PNG (o pdf-lib do catálogo e do orçamento não lê WebP).
 */
export const MAX_PHOTOS = 8;
export const PhotoOwner = z.string().regex(/^(product|project|print):\d+$/, "Dono de foto inválido.");
export type PhotoOwner = `${"product" | "project" | "print"}:${number}`;
export type PhotoRow = { id: number; owner: string; position: number; dataUrl: string; createdAt: string };

const FORMAT = /^data:image\/(jpeg|png|webp);base64,/;
export const ownerOf = (kind: "product" | "project" | "print", id: number) => `${kind}:${id}` as PhotoOwner;

export const photos = {
  list: (db: Db, owner: string) => db.select<PhotoRow>("SELECT * FROM photos WHERE owner = ? ORDER BY position, id", [owner]),
  /** Capas de todos os donos de um tipo: { id do dono: data URL da 1ª foto }. */
  async covers(db: Db, kind: "product" | "project" | "print"): Promise<Record<number, string>> {
    const rows = await db.select<PhotoRow>("SELECT * FROM photos WHERE owner LIKE ? ORDER BY owner, position, id", [`${kind}:%`]);
    const out: Record<number, string> = {};
    for (const r of rows) out[Number(r.owner.slice(kind.length + 1))] ??= r.dataUrl;
    return out;
  },
  /** Acrescenta no fim; devolve o id. */
  async add(db: Db, owner: string, dataUrl: string): Promise<number> {
    PhotoOwner.parse(owner);
    if (!FORMAT.test(dataUrl)) throw new Error("Formato de foto não suportado.");
    const [{ n }] = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM photos WHERE owner = ?", [owner]);
    if (n >= MAX_PHOTOS) throw new Error(`Cada item aceita até ${MAX_PHOTOS} fotos.`);
    const r = await db.execute("INSERT INTO photos (owner, position, dataUrl, createdAt) VALUES (?, ?, ?, ?)", [owner, n, dataUrl, new Date().toISOString()]);
    return Number(r.lastInsertId);
  },
  remove: (db: Db, id: number) => db.execute("DELETE FROM photos WHERE id = ?", [id]),
  removeOwner: (db: Db, owner: string) => db.execute("DELETE FROM photos WHERE owner = ?", [owner]),
  /** Põe as fotos na ordem dada (ids); a 1ª vira a capa. */
  async reorder(db: Db, owner: string, ids: number[]): Promise<void> {
    for (const [i, id] of ids.entries()) await db.execute("UPDATE photos SET position = ? WHERE id = ? AND owner = ?", [i, id, owner]);
  },
  async makeCover(db: Db, owner: string, id: number): Promise<void> {
    const list = await photos.list(db, owner);
    await photos.reorder(db, owner, [id, ...list.map((p) => p.id).filter((x) => x !== id)]);
  },
  /** Tamanho das fotos guardadas (caracteres do data URL ≈ bytes no backup). */
  async totalChars(db: Db): Promise<number> {
    const [{ n }] = await db.select<{ n: number | null }>("SELECT SUM(LENGTH(dataUrl)) AS n FROM photos");
    return n ?? 0;
  },
  /** Troca a imagem (depois de girar, cortar ou ajustar o brilho). */
  async replace(db: Db, id: number, dataUrl: string): Promise<void> {
    if (!FORMAT.test(dataUrl)) throw new Error("Formato de foto não suportado.");
    await db.execute("UPDATE photos SET dataUrl = ? WHERE id = ?", [dataUrl, id]);
  },
};
