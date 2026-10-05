import { describe, expect, test } from "vitest";
import { exportBackup, parseBackup, restoreBackup } from "./backup";
import { migrate } from "./migrations";
import { memoryDb } from "./testDb";

async function seeded() {
  const db = memoryDb();
  await migrate(db);
  await db.execute("INSERT INTO settings (id, data) VALUES (1, ?)", ['{"kwhPrice":1}']);
  return db;
}

describe("backup", () => {
  test("exporta, restaura e devolve exatamente os mesmos dados", async () => {
    const db = await seeded();
    const json = JSON.stringify(await exportBackup(db));
    await db.execute("UPDATE settings SET data = ?", ['{"kwhPrice":9}']);

    await restoreBackup(db, parseBackup(json));

    expect(await db.select("SELECT * FROM settings")).toEqual([{ id: 1, data: '{"kwhPrice":1}' }]);
  });

  test("restaurar que falha no meio não mexe em nada: tudo ou nada (C1)", async () => {
    const db = await seeded();
    await db.execute("INSERT INTO printers (name, watts) VALUES ('Bambu A1', 95)");
    const b = await exportBackup(db);
    // duas impressoras com o mesmo id: o INSERT da 2ª falha depois de várias tabelas já trocadas
    const broken = { ...b, tables: { ...b.tables, settings: [{ id: 1, data: '{"kwhPrice":7}' }], printers: [{ ...b.tables.printers[0] }, { ...b.tables.printers[0] }] } };
    await expect(restoreBackup(db, parseBackup(JSON.stringify(broken)))).rejects.toThrow(/UNIQUE/);
    expect(await db.select("SELECT name FROM printers")).toEqual([{ name: "Bambu A1" }]);
    expect(await db.select("SELECT data FROM settings")).toEqual([{ data: '{"kwhPrice":1}' }]);
  });

  test("backup antigo (impressora sem preço/vida útil) restaura com os padrões", async () => {
    const db = await seeded();
    const b = await exportBackup(db);
    const old = { ...b, schemaVersion: 9, tables: { ...b.tables, printers: [{ id: 1, name: "A1", watts: 95 }] } };
    await restoreBackup(db, parseBackup(JSON.stringify(old)));
    expect(await db.select("SELECT * FROM printers")).toEqual([{ id: 1, name: "A1", watts: 95, price: 0, lifeHours: 5000, upkeepPerHour: 0 }]);
  });

  test("backup antigo (produto sem taxa de falha) restaura com null (#35)", async () => {
    const db = await seeded();
    const b = await exportBackup(db);
    const product = { id: 1, name: "Chaveiro", kind: "simple", composition: '{"filaments":[],"materials":[],"items":[]}', printerId: null, printMinutes: 0, laborMinutes: 0, piecesPerPlate: 1, freight: 0, manualPrice: null, consignmentPrice: null, stock: 0, minStock: 0, sku: "", notes: "" };
    await restoreBackup(db, parseBackup(JSON.stringify({ ...b, schemaVersion: 10, tables: { ...b.tables, products: [product] } })));
    expect(await db.select("SELECT name, failurePct FROM products")).toEqual([{ name: "Chaveiro", failurePct: null }]);
  });

  test("backup antigo sem número de orçamento: a restauração numera por ano (#36)", async () => {
    const db = await seeded();
    const b = await exportBackup(db);
    const q = (id: number, createdAt: string) => ({ id, data: "{}", createdAt, convertedOrderId: null });
    const old = { ...b, schemaVersion: 11, tables: { ...b.tables, quotes: [q(1, "2025-12-01 10:00:00"), q(2, "2026-01-05 10:00:00"), q(3, "2026-02-05 10:00:00")], quote_numbers: undefined } };
    await restoreBackup(db, parseBackup(JSON.stringify(old)));
    expect(await db.select("SELECT id, year, seq FROM quotes ORDER BY id")).toEqual([
      { id: 1, year: 2025, seq: 1 },
      { id: 2, year: 2026, seq: 1 },
      { id: 3, year: 2026, seq: 2 },
    ]);
    expect(await db.select("SELECT id, seq FROM quote_numbers ORDER BY id")).toEqual([{ id: 2025, seq: 1 }, { id: 2026, seq: 2 }]);
  });

  test("rejeita arquivo que não é backup do app", () => {
    expect(() => parseBackup("{}")).toThrow(/não é um backup/i);
    expect(() => parseBackup("lixo")).toThrow(/não é um backup/i);
  });

  test("rejeita backup de versão mais nova do app", async () => {
    const b = await exportBackup(await seeded());
    expect(() => parseBackup(JSON.stringify({ ...b, schemaVersion: 999 }))).toThrow(/versão mais nova/i);
  });
});

test("backup de uma versão sem uma tabela não apaga o que já existe nela (C2)", async () => {
  // Arrange: a ficha de impressão (print_logs) não existia na versão do backup
  const db = await seeded();
  await db.execute("INSERT INTO print_logs (at, result) VALUES ('2026-10-01T10:00:00Z', 'ok')");
  const b = await exportBackup(db);
  const tables = Object.fromEntries(Object.entries(b.tables).filter(([name]) => name !== "print_logs"));

  // Act
  await restoreBackup(db, parseBackup(JSON.stringify({ ...b, schemaVersion: 18, tables })));

  // Assert
  expect(await db.select("SELECT result FROM print_logs")).toEqual([{ result: "ok" }]);
});

describe("fotos no backup (#162)", () => {
  const JPG = "data:image/jpeg;base64,AAAA";

  test("backup antigo com product_photos: a restauração passa as fotos para a tabela photos (dono product:<id>)", async () => {
    const db = await seeded();
    const b = await exportBackup(db);
    const tables = { ...b.tables, product_photos: [{ id: 3, productId: 7, position: 0, dataUrl: JPG }] } as Record<string, unknown>;
    delete tables.photos;
    await restoreBackup(db, parseBackup(JSON.stringify({ ...b, schemaVersion: 20, tables })));
    expect(await db.select("SELECT id, owner, position, dataUrl FROM photos")).toEqual([{ id: 3, owner: "product:7", position: 0, dataUrl: JPG }]);
  });

  test("sem fotos no arquivo: o backup sai leve e restaurar não apaga as fotos que já estão no app", async () => {
    const db = await seeded();
    await db.execute("INSERT INTO products (id, name, kind, composition) VALUES (1, 'Vaso', 'simple', '{\"filaments\":[],\"materials\":[],\"items\":[]}')");
    await db.execute("INSERT INTO photos (owner, position, dataUrl, createdAt) VALUES ('product:1', 0, ?, '2026-10-01T10:00:00Z')", [JPG]);
    const light = await exportBackup(db, { photos: false });
    expect(light.tables.photos).toEqual([]);
    expect(light.photosOmitted).toBe(true);
    await db.execute("UPDATE settings SET data = ?", ['{"kwhPrice":9}']);
    await restoreBackup(db, parseBackup(JSON.stringify(light)));
    expect(await db.select("SELECT data FROM settings")).toEqual([{ data: '{"kwhPrice":1}' }]);
    expect(await db.select("SELECT owner FROM photos")).toEqual([{ owner: "product:1" }]);
    // com fotos (padrão, e a sincronização #16): vão junto
    expect((await exportBackup(db)).tables.photos).toHaveLength(1);
  });
});

test("backup das versões 15 a 19 com projetos salvos restaura: favorito e tags ganham o padrão (A2)", async () => {
  const db = await seeded();
  const b = await exportBackup(db);
  // projeto de antes da biblioteca (#161): sem favorite, tags, updatedAt, productId e orderId
  const project = { id: 1, toolId: "chaveiro", name: "Ana", data: "{}", thumb: null, at: "2026-09-01T10:00:00Z" };
  const old = { ...b, schemaVersion: 15, tables: { ...b.tables, tool_projects: [project] } };

  await restoreBackup(db, parseBackup(JSON.stringify(old)));

  expect(await db.select("SELECT name, favorite, tags FROM tool_projects")).toEqual([{ name: "Ana", favorite: 0, tags: "[]" }]);
});

test("restaurar um backup leve não deixa foto de um produto, projeto ou impressão que o backup não tem (B4)", async () => {
  const db = await seeded();
  await db.execute("INSERT INTO printers (name, watts) VALUES ('A1', 95)");
  await db.execute("INSERT INTO products (id, name, kind, composition) VALUES (1, 'Vaso', 'simple', '{\"filaments\":[],\"materials\":[],\"items\":[]}')");
  const light = await exportBackup(db, { photos: false }); // só o produto 1
  // hoje o app tem mais produtos e projetos, cada um com foto, que o backup não conhece
  await db.execute("INSERT INTO products (id, name, kind, composition) VALUES (2, 'Caneca', 'simple', '{\"filaments\":[],\"materials\":[],\"items\":[]}')");
  await db.execute("INSERT INTO tool_projects (id, toolId, name, data, thumb, at) VALUES (7, 'chaveiro', 'Ana', '{}', NULL, 'x')");
  const photo = (owner: string) => db.execute("INSERT INTO photos (owner, position, dataUrl, createdAt) VALUES (?, 0, 'data:image/jpeg;base64,AA', 'x')", [owner]);
  for (const owner of ["product:1", "product:2", "project:7", "project:8", "print:3"]) await photo(owner);

  await restoreBackup(db, parseBackup(JSON.stringify(light)));

  expect((await db.select<{ owner: string }>("SELECT owner FROM photos ORDER BY owner")).map((r) => r.owner)).toEqual(["product:1"]);
});

