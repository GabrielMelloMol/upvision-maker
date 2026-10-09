import { beforeEach, describe, expect, test } from "vitest";
import { exportBackup, parseBackup, restoreBackup } from "./backup";
import { consignmentsRepo } from "./consignmentsRepo";
import { migrate } from "./migrations";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});

const input = { customerId: 3, customerName: "Loja da Bia", startDate: "2026-09-01", periodDays: 30, notes: "", items: [{ productId: 1, name: "Chaveiro", qty: 20, transferPrice: 8, salePrice: 15 }] };

describe("consignados (#184)", () => {
  test("cria, marca a reposição, encerra e exclui", async () => {
    const id = await consignmentsRepo.create(db, input, "2026-09-01");
    let [c] = await consignmentsRepo.list(db);
    expect(c).toMatchObject({ id, customerName: "Loja da Bia", active: true, lastRestockAt: null, items: [{ name: "Chaveiro", qty: 20 }] });
    await consignmentsRepo.restocked(db, id, "2026-10-02");
    await consignmentsRepo.setActive(db, id, false);
    [c] = await consignmentsRepo.list(db);
    expect(c).toMatchObject({ lastRestockAt: "2026-10-02", active: false });
    await consignmentsRepo.remove(db, id);
    expect(await consignmentsRepo.list(db)).toEqual([]);
  });

  test("recusa contrato sem peças ou com prazo inválido", async () => {
    await expect(consignmentsRepo.create(db, { ...input, items: [] }, "x")).rejects.toThrow();
    await expect(consignmentsRepo.create(db, { ...input, periodDays: 0 }, "x")).rejects.toThrow();
  });

  test("peças ilegíveis num contrato não derrubam a lista", async () => {
    await consignmentsRepo.create(db, input, "2026-09-01");
    await db.execute("INSERT INTO consignments (customerId, customerName, startDate, periodDays, items, createdAt) VALUES (4, 'Quebrado', '2026-09-01', 30, 'não é json', 'x')");
    const list = await consignmentsRepo.list(db);
    expect(list).toHaveLength(2);
    expect(list.find((c) => c.customerName === "Quebrado")?.items).toEqual([]);
  });

  test("entra no backup e volta na restauração; backup antigo sem a tabela não apaga os contratos", async () => {
    const id = await consignmentsRepo.create(db, input, "2026-09-01");
    await consignmentsRepo.restocked(db, id, "2026-10-02");
    const backup = JSON.parse(JSON.stringify(await exportBackup(db)));
    expect(backup.tables.consignments).toHaveLength(1);
    await consignmentsRepo.remove(db, id);
    await restoreBackup(db, parseBackup(JSON.stringify(backup)));
    expect(await consignmentsRepo.list(db)).toMatchObject([{ customerName: "Loja da Bia", lastRestockAt: "2026-10-02", items: [{ name: "Chaveiro" }] }]);

    const old = { ...backup, schemaVersion: 22 };
    delete old.tables.consignments;
    await restoreBackup(db, parseBackup(JSON.stringify(old)));
    expect(await consignmentsRepo.list(db)).toHaveLength(1);
  });
});
