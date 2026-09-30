import { beforeEach, expect, test } from "vitest";
import { migrate } from "./migrations";
import { memoryDb } from "./testDb";
import { PROJECTS_MAX, toolProjects, toolState } from "./toolStateRepo";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});

test("estado da ferramenta: grava, atualiza no mesmo id e apaga (#85)", async () => {
  expect(await toolState.get(db, "keychain")).toBeNull();
  await toolState.save(db, { id: "keychain", data: '{"text":"Ana"}', updatedAt: "2026-09-29T10:00:00Z" });
  await toolState.save(db, { id: "keychain", data: '{"text":"Bia"}', updatedAt: "2026-09-29T11:00:00Z" });
  expect(await toolState.get(db, "keychain")).toMatchObject({ data: '{"text":"Bia"}' });
  await toolState.remove(db, "keychain");
  expect(await toolState.get(db, "keychain")).toBeNull();
});

test("projetos: só os 10 mais recentes por ferramenta, sem mexer nas outras", async () => {
  for (let i = 0; i < PROJECTS_MAX + 3; i++) await toolProjects.add(db, { toolId: "qr", name: `p${i}`, data: "{}", thumb: null, at: `2026-09-${String(i + 1).padStart(2, "0")}` });
  await toolProjects.add(db, { toolId: "keychain", name: "k", data: "{}", thumb: "data:image/webp;base64,x", at: "2026-01-01" });
  const qr = await toolProjects.list(db, "qr");
  expect(qr).toHaveLength(PROJECTS_MAX);
  expect(qr[0].name).toBe(`p${PROJECTS_MAX + 2}`);
  expect(await toolProjects.list(db, "keychain")).toHaveLength(1);
});
