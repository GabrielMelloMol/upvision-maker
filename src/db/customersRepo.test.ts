import { beforeEach, expect, test } from "vitest";
import { DEFAULT_COMPANY, EMPTY_CUSTOMER } from "../domain/customers";
import { exportBackup, parseBackup, restoreBackup } from "./backup";
import { customersRepo, loadCompany, saveCompany } from "./customersRepo";
import { migrate } from "./migrations";
import { memoryDb } from "./testDb";
import type { Db } from "./types";

let db: Db;
beforeEach(async () => {
  db = memoryDb();
  await migrate(db);
});

test("clientes: cria, lista (ativos primeiro), edita e exclui; booleano volta como boolean", async () => {
  const a = await customersRepo.insert(db, { ...EMPTY_CUSTOMER, name: "Zeca", active: false });
  await customersRepo.insert(db, { ...EMPTY_CUSTOMER, name: "Ana", document: "529.982.247-25" });
  const list = await customersRepo.list(db);
  expect(list.map((c) => c.name)).toEqual(["Ana", "Zeca"]);
  expect(list[1].active).toBe(false);
  expect(list[0].document).toBe("52998224725");
  await customersRepo.update(db, a, { ...EMPTY_CUSTOMER, name: "Zeca", active: true, discountPct: 10 });
  expect((await customersRepo.list(db)).find((c) => c.id === a)?.discountPct).toBe(10);
  await customersRepo.remove(db, a);
  expect(await customersRepo.list(db)).toHaveLength(1);
});

test("empresa: padrão quando vazia, salva e relê; entra no backup", async () => {
  expect(await loadCompany(db)).toEqual(DEFAULT_COMPANY);
  await saveCompany(db, { ...DEFAULT_COMPANY, name: "UpVision 3D", pixKey: "529.982.247-25" });
  expect((await loadCompany(db)).pixKey).toBe("52998224725");
  await customersRepo.insert(db, { ...EMPTY_CUSTOMER, name: "Ana" });
  const json = JSON.stringify(await exportBackup(db));
  await db.execute("DELETE FROM company");
  await db.execute("DELETE FROM customers");
  await restoreBackup(db, parseBackup(json));
  expect((await loadCompany(db)).name).toBe("UpVision 3D");
  expect((await customersRepo.list(db))[0].active).toBe(true);
});

test("dados da empresa com um campo inválido: o resto é aproveitado em vez de virar tudo em branco (A3)", async () => {
  const db = memoryDb();
  await migrate(db);
  await saveCompany(db, { ...DEFAULT_COMPANY, name: "UpVision 3D", phone: "21 99999-0000" });
  const [{ data }] = await db.select<{ data: string }>("SELECT data FROM company WHERE id = 1");
  // uma chave Pix que a validação de hoje recusa
  await db.execute("UPDATE company SET data = ? WHERE id = 1", [JSON.stringify({ ...JSON.parse(data), pixKey: "chave-invalida" })]);

  const company = await loadCompany(db);

  expect(company.name).toBe("UpVision 3D");
  expect(company.phone).toBe("21 99999-0000");
  expect(company.pixKey).toBe("");
});

