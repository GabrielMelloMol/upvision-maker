import { beforeEach, expect, test } from "vitest";
import { EMPTY_PRODUCT, planConsumption, productPricing } from "../domain/products";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { exportBackup, parseBackup, restoreBackup } from "./backup";
import { migrate } from "./migrations";
import { photosRepo, productsRepo } from "./productsRepo";
import { planToMovements } from "./stock";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";

test("salva produto com composição e relê igual", async () => {
  const id = await productsRepo.insert(db, { ...EMPTY_PRODUCT, name: "Luminária", composition: { filaments: [{ filamentId: 1, grams: 120 }], materials: [], items: [] } });
  const [p] = await productsRepo.list(db);
  expect(p.id).toBe(id);
  expect(p.composition.filaments).toEqual([{ filamentId: 1, grams: 120 }]);
});

test("variações (#82) salvam, relêem e voltam do backup", async () => {
  const variants = [{ name: "Azul", sku: "CH-AZ", stock: 2, price: 19.9, swaps: [{ from: 1, to: 2 }] }];
  const id = await productsRepo.insert(db, { ...EMPTY_PRODUCT, name: "Chaveiro", variationLabel: "Cor", variants });
  expect((await productsRepo.list(db))[0].variants).toEqual(variants);
  const json = JSON.stringify(await exportBackup(db));
  await productsRepo.remove(db, id);
  await restoreBackup(db, parseBackup(json));
  expect((await productsRepo.list(db))[0]).toMatchObject({ variationLabel: "Cor", variants });
});

test("backup de antes das variações (sem as colunas) restaura com Cor e lista vazia", async () => {
  const id = await productsRepo.insert(db, { ...EMPTY_PRODUCT, name: "Antigo" });
  const backup = await exportBackup(db);
  const old = { ...backup, tables: { ...backup.tables, products: backup.tables.products.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "variants" && k !== "variationLabel"))) } };
  await productsRepo.remove(db, id);
  await restoreBackup(db, parseBackup(JSON.stringify(old)));
  expect((await productsRepo.list(db))[0]).toMatchObject({ name: "Antigo", variationLabel: "Cor", variants: [] });
});

test("recusa produto inválido", async () => {
  await expect(productsRepo.insert(db, { ...EMPTY_PRODUCT, name: "" })).rejects.toThrow();
  await expect(productsRepo.insert(db, { ...EMPTY_PRODUCT, name: "x", piecesPerPlate: 0 })).rejects.toThrow();
});

test("fotos: até 8, capa, exclusão junto com o produto e só imagens", async () => {
  const id = await productsRepo.insert(db, { ...EMPTY_PRODUCT, name: "P" });
  for (let i = 0; i < 8; i++) await photosRepo.add(db, id, PNG);
  await expect(photosRepo.add(db, id, PNG)).rejects.toThrow(/até 8/);
  await expect(photosRepo.add(db, id, "data:text/html;base64,PGI+")).rejects.toThrow();
  const photos = await photosRepo.list(db, id);
  await photosRepo.makeCover(db, id, photos[5].id);
  expect((await photosRepo.list(db, id))[0].id).toBe(photos[5].id);
  await productsRepo.remove(db, id);
  expect(await photosRepo.list(db, id)).toEqual([]);
});

test("produtos e fotos entram no backup e voltam na restauração", async () => {
  const id = await productsRepo.insert(db, { ...EMPTY_PRODUCT, name: "Kit", kind: "kit" });
  await photosRepo.add(db, id, PNG);
  const json = JSON.stringify(await exportBackup(db));
  await productsRepo.remove(db, id);
  await restoreBackup(db, parseBackup(json));
  expect((await productsRepo.list(db))[0].name).toBe("Kit");
  expect(await photosRepo.list(db, id)).toHaveLength(1);
});

test("planToMovements: baixa negativa, estorno positivo, ignora zeros", () => {
  const plan = { filaments: { 1: 150 }, materials: { 2: 3, 3: 0 }, products: { 4: 2 } };
  expect(planToMovements(plan, -1)).toEqual([
    { kind: "filament", id: 1, delta: -150 },
    { kind: "material", id: 2, delta: -3 },
    { kind: "product", id: 4, delta: -2 },
  ]);
  expect(planToMovements(plan, 1)[0].delta).toBe(150);
});

test("A4: composição ilegível marca o produto; custo e baixa de estoque recusam em vez de usar vazio", async () => {
  await productsRepo.insert(db, { ...EMPTY_PRODUCT, name: "Antigo", composition: { filaments: [{ filamentId: 1, grams: 120 }], materials: [], items: [] } });
  await db.execute(`UPDATE products SET composition = '{"filaments":[{"filamentId":"x"}]}'`);
  const [p] = await productsRepo.list(db);
  expect(p.readError).toMatch(/composição/);
  const ctx = { filaments: [], materials: [], printers: [], products: [p], settings: DEFAULT_SETTINGS };
  expect(() => productPricing(p, ctx)).toThrow(/Antigo/);
  expect(() => planConsumption(p.id, 1, ctx, { useOwnStock: false })).toThrow(/Antigo/);
});

test("A4: variações ilegíveis também marcam o produto", async () => {
  await productsRepo.insert(db, { ...EMPTY_PRODUCT, name: "Cores" });
  await db.execute(`UPDATE products SET variants = 'não é json'`);
  expect((await productsRepo.list(db))[0].readError).toMatch(/variações/);
});
