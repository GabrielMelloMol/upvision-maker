import { beforeEach, describe, expect, test } from "vitest";
import { migrate } from "./migrations";
import { memoryDb } from "./testDb";
import { PROJECTS_MAX, projectTags, toolProjects, toolState } from "./toolStateRepo";
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

describe("Meus projetos (#161)", () => {
  const add = (toolId: string, name: string, at: string) => toolProjects.add(db, { toolId, name, data: "{}", thumb: null, at });

  test("biblioteca: todos os projetos de todas as ferramentas, mais recentes primeiro; a lista da ferramenta segue com os 10 últimos", async () => {
    for (let i = 0; i < 12; i++) await add("keychain", `Chaveiro ${i}`, `2026-09-${String(10 + i).padStart(2, "0")}T10:00:00Z`);
    await add("medal", "Medalha", "2026-09-30T10:00:00Z");
    const all = await toolProjects.all(db);
    expect(all).toHaveLength(13);
    expect(all[0].name).toBe("Medalha");
    expect(await toolProjects.list(db, "keychain")).toHaveLength(PROJECTS_MAX);
  });

  test("editar só muda os campos da biblioteca e marca a data; favorito, tags sem repetir, ligação a produto", async () => {
    const id = await add("keychain", "Ana", "2026-09-01T10:00:00Z");
    await toolProjects.update(db, id, { name: "Ana (azul)", favorite: true, tags: ["escola", "escola", "azul"], productId: 7 });
    const p = (await toolProjects.get(db, id))!;
    expect(p).toMatchObject({ name: "Ana (azul)", favorite: 1, productId: 7, data: "{}", toolId: "keychain" });
    expect(projectTags(p)).toEqual(["escola", "azul"]);
    expect(p.updatedAt! > "2026-09-01").toBe(true);
    // campo de fora da lista branca é recusado
    await expect(toolProjects.update(db, id, { tags: ["x".repeat(31)] })).rejects.toThrow();
  });

  test("fazer de novo: cópia com o mesmo estado e (cópia) no nome, sem favorito", async () => {
    const id = await add("medal", "Formatura", "2026-09-01T10:00:00Z");
    await toolProjects.update(db, id, { favorite: true });
    const copy = (await toolProjects.get(db, await toolProjects.duplicate(db, id)))!;
    expect(copy).toMatchObject({ name: "Formatura (cópia)", toolId: "medal", data: "{}", favorite: 0 });
  });

  test("projeto gravado antes da #161 (sem as colunas novas) continua aparecendo", async () => {
    await db.execute("INSERT INTO tool_projects (toolId, name, data, thumb, at) VALUES ('qr', 'Wi-Fi', '{}', NULL, '2026-08-01T10:00:00Z')");
    const [p] = await toolProjects.all(db);
    expect(p).toMatchObject({ name: "Wi-Fi", favorite: 0, tags: "[]" });
    expect(projectTags(p)).toEqual([]);
  });
});
