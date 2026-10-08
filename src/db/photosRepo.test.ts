import { beforeEach, expect, test } from "vitest";
import { migrate } from "./migrations";
import { photos, MAX_PHOTOS } from "./photosRepo";
import { photosRepo as productPhotos } from "./productsRepo";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});
const jpg = (n: number) => `data:image/jpeg;base64,${"A".repeat(n)}`;

test("fotos por dono: ordem, capa, mover e limite (#162)", async () => {
  await photos.add(db, "project:5", jpg(1));
  await photos.add(db, "project:5", jpg(2));
  const b = await photos.add(db, "project:5", jpg(3));
  await photos.add(db, "product:9", jpg(4));
  expect((await photos.list(db, "project:5")).map((p) => p.dataUrl)).toEqual([jpg(1), jpg(2), jpg(3)]);
  await photos.makeCover(db, "project:5", b);
  expect((await photos.list(db, "project:5")).map((p) => p.dataUrl)).toEqual([jpg(3), jpg(1), jpg(2)]);
  expect(await photos.covers(db, "project")).toEqual({ 5: jpg(3) });
  await photos.removeOwner(db, "project:5");
  expect(await photos.list(db, "project:5")).toEqual([]);
  for (let i = 1; i < MAX_PHOTOS; i++) await photos.add(db, "product:9", jpg(i));
  await expect(photos.add(db, "product:9", jpg(1))).rejects.toThrow(`até ${MAX_PHOTOS} fotos`);
});

test("dono e formato validados", async () => {
  await expect(photos.add(db, "qualquer", jpg(1))).rejects.toThrow();
  await expect(photos.add(db, "project:1", "data:image/gif;base64,AA")).rejects.toThrow("Formato de foto");
});

test("produtos seguem com a mesma API (photosRepo do productsRepo) em cima da tabela nova", async () => {
  await productPhotos.add(db, 2, jpg(1));
  await productPhotos.add(db, 2, jpg(2));
  const list = await productPhotos.list(db, 2);
  expect(list.map((p) => ({ productId: p.productId, position: p.position }))).toEqual([{ productId: 2, position: 0 }, { productId: 2, position: 1 }]);
  await productPhotos.makeCover(db, 2, list[1].id);
  expect(await productPhotos.covers(db)).toEqual({ 2: jpg(2) });
  await productPhotos.remove(db, list[0].id);
  expect(await productPhotos.list(db, 2)).toHaveLength(1);
});

test("migração leva as fotos de produto que já existiam", async () => {
  const old = memoryDb();
  // banco antes da #162: roda as migrações até a anterior e grava uma foto na tabela antiga
  const { MIGRATIONS } = await import("./migrations");
  const photosAt = MIGRATIONS.findIndex((m) => m.some((sql) => sql.includes("CREATE TABLE photos")));
  for (const [v, sqls] of MIGRATIONS.slice(0, photosAt).entries()) {
    for (const sql of sqls) await old.execute(sql);
    await old.execute(`PRAGMA user_version = ${v + 1}`);
  }
  await old.execute("INSERT INTO product_photos (productId, position, dataUrl) VALUES (4, 0, ?)", [jpg(5)]);
  await migrate(old);
  expect(await photos.list(old, "product:4")).toEqual([expect.objectContaining({ owner: "product:4", position: 0, dataUrl: jpg(5) })]);
});
