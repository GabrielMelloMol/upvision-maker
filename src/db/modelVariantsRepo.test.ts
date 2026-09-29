import { beforeEach, expect, test } from "vitest";
import { migrate } from "./migrations";
import { modelVariants } from "./modelVariantsRepo";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});

test("variações próprias por modelo: cria, lista só as do modelo, apaga; nome obrigatório (#26)", async () => {
  const a = await modelVariants.create(db, { modelId: "sign", label: "Loja da Ana", data: "{}", createdAt: "2026-09-29" });
  await modelVariants.create(db, { modelId: "pix", label: "Outra", data: "{}", createdAt: "2026-09-29" });
  expect((await modelVariants.list(db, "sign")).map((v) => v.label)).toEqual(["Loja da Ana"]);
  await modelVariants.remove(db, a);
  expect(await modelVariants.list(db, "sign")).toEqual([]);
  await expect(modelVariants.create(db, { modelId: "sign", label: "  ", data: "{}", createdAt: "x" })).rejects.toThrow(/nome/);
});
