import { beforeEach, expect, test } from "vitest";
import { EMPTY_PRODUCT } from "../domain/products";
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
