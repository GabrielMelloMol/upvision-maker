import { CompanyInput, CustomerInput, DEFAULT_COMPANY, type Company, type Customer } from "../domain/customers";
import type { Db } from "./types";

type Row = Omit<Customer, "active"> & { active: number };
const COLS = Object.keys(CustomerInput.shape) as (keyof CustomerInput)[];
const values = (v: CustomerInput) => COLS.map((c) => (c === "active" ? (v.active ? 1 : 0) : v[c]));

export const customersRepo = {
  async list(db: Db): Promise<Customer[]> {
    return (await db.select<Row>("SELECT * FROM customers ORDER BY active DESC, name COLLATE NOCASE")).map((r) => ({ ...r, active: r.active !== 0 }));
  },
  async insert(db: Db, input: unknown): Promise<number> {
    const v = CustomerInput.parse(input);
    const r = await db.execute(`INSERT INTO customers (${COLS.join(", ")}) VALUES (${COLS.map(() => "?").join(", ")})`, values(v));
    return Number(r.lastInsertId);
  },
  async update(db: Db, id: number, input: unknown): Promise<void> {
    const v = CustomerInput.parse(input);
    await db.execute(`UPDATE customers SET ${COLS.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...values(v), id]);
  },
  remove: (db: Db, id: number) => db.execute("DELETE FROM customers WHERE id = ?", [id]),
};

export async function loadCompany(db: Db): Promise<Company> {
  const [row] = await db.select<{ data: string }>("SELECT data FROM company WHERE id = 1");
  if (!row) return DEFAULT_COMPANY;
  const parsed = CompanyInput.safeParse({ ...DEFAULT_COMPANY, ...JSON.parse(row.data) });
  if (!parsed.success) {
    console.error("Dados da empresa inválidos no banco, usando padrão:", parsed.error);
    return DEFAULT_COMPANY;
  }
  return parsed.data;
}

export async function saveCompany(db: Db, c: unknown): Promise<Company> {
  const v = CompanyInput.parse(c);
  await db.execute("INSERT INTO company (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data", [JSON.stringify(v)]);
  return v;
}
