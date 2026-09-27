import { ask } from "@tauri-apps/plugin-dialog";
import { Fragment, useState } from "react";
import { getDb } from "../db";
import type { Db } from "../db/types";
import { money, parseDecimal } from "../domain/format";
import { fieldErrors } from "./fieldErrors";
import { errorText, useToast } from "./Toast";
import { useData } from "./useData";

export type Field = {
  key: string;
  label: string;
  kind: "text" | "number" | "money" | "select";
  options?: readonly string[];
};

type Row = { id: number } & Record<string, string | number>;

type Repo = {
  list(db: Db): Promise<Row[]>;
  insert(db: Db, v: unknown): Promise<void>;
  update(db: Db, id: number, v: unknown): Promise<void>;
  remove(db: Db, id: number): Promise<unknown>;
  restock?(db: Db, id: number, qty: number, price: number): Promise<void>;
};

type Props = {
  title: string;
  singular: string;
  repo: Repo;
  fields: Field[];
  defaults: Record<string, string>;
  isLow?: (r: Row) => boolean;
  restock?: { qtyLabel: string; priceLabel: string; defaultQty: (r: Row) => number };
};

const show = (f: Field, v: string | number) =>
  f.kind === "money" ? money(Number(v)) : f.kind === "number" ? Number(v).toLocaleString("pt-BR") : v;

export default function CrudPage({ title, singular, repo, fields, defaults, isLow, restock }: Props) {
  const [rows, reload] = useData((db) => repo.list(db), [] as Row[]);
  const [form, setForm] = useState(defaults);
  const [editing, setEditing] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restocking, setRestocking] = useState<{ id: number; qty: string; price: string } | null>(null);
  const toast = useToast();

  function toValues() {
    const v: Record<string, unknown> = {};
    for (const f of fields) v[f.key] = f.kind === "number" || f.kind === "money" ? parseDecimal(form[f.key] ?? "") : form[f.key];
    return v;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const db = await getDb();
      if (editing === null) await repo.insert(db, toValues());
      else await repo.update(db, editing, toValues());
      toast(editing === null ? `${singular} cadastrado(a).` : "Alterações salvas.");
      cancel();
      reload();
    } catch (err) {
      setErrors(fieldErrors(err));
    }
  }

  function cancel() {
    setForm(defaults);
    setEditing(null);
    setErrors({});
  }

  function edit(r: Row) {
    setEditing(r.id);
    setErrors({});
    setForm(Object.fromEntries(fields.map((f) => [f.key, String(r[f.key] ?? "")])));
  }

  async function remove(r: Row) {
    if (!(await ask(`Excluir "${r[fields[0].key]}"?`, { title: "Confirmar exclusão", kind: "warning" }))) return;
    try {
      await repo.remove(await getDb(), r.id);
      reload();
    } catch (e) {
      toast(`Não foi possível excluir: ${errorText(e)}`, "error");
    }
  }

  async function confirmRestock() {
    if (!restocking || !repo.restock) return;
    try {
      await repo.restock(await getDb(), restocking.id, parseDecimal(restocking.qty), parseDecimal(restocking.price));
      toast("Reposição registrada. Custo médio atualizado.");
      setRestocking(null);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  return (
    <>
      <h1>{title}</h1>
      <form className="card" onSubmit={submit} noValidate>
        <div className="grid">
          {fields.map((f) => (
            <label key={f.key}>
              {f.label}
              {f.kind === "select" ? (
                <select value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                  {f.options?.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  value={form[f.key] ?? ""}
                  inputMode={f.kind === "text" ? "text" : "decimal"}
                  aria-invalid={!!errors[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
              {errors[f.key] && <span className="error">{errors[f.key]}</span>}
            </label>
          ))}
        </div>
        {errors._ && <p className="error">{errors._}</p>}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="primary" type="submit">{editing === null ? "Adicionar" : "Salvar alterações"}</button>
          {editing !== null && <button type="button" onClick={cancel}>Cancelar</button>}
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="muted">Nada cadastrado ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.key} className={f.kind === "text" || f.kind === "select" ? "" : "num"}>{f.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  {fields.map((f, i) => (
                    <td key={f.key} className={f.kind === "text" || f.kind === "select" ? "" : "num"}>
                      {show(f, r[f.key])} {i === 0 && isLow?.(r) && <span className="badge">estoque baixo</span>}
                    </td>
                  ))}
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    {restock && (
                      <button className="link" onClick={() => setRestocking({ id: r.id, qty: String(restock.defaultQty(r)), price: "" })}>
                        Repor
                      </button>
                    )}
                    <button className="link" onClick={() => edit(r)}>Editar</button>
                    <button className="link danger" onClick={() => remove(r)}>Excluir</button>
                  </td>
                </tr>
                {restock && restocking?.id === r.id && (
                  <tr>
                    <td colSpan={fields.length + 1}>
                      <div className="row">
                        <label>
                          {restock.qtyLabel}
                          <input inputMode="decimal" value={restocking.qty} onChange={(e) => setRestocking({ ...restocking, qty: e.target.value })} />
                        </label>
                        <label>
                          {restock.priceLabel}
                          <input inputMode="decimal" autoFocus value={restocking.price} onChange={(e) => setRestocking({ ...restocking, price: e.target.value })} />
                        </label>
                        <button className="primary" onClick={confirmRestock}>Confirmar reposição</button>
                        <button onClick={() => setRestocking(null)}>Cancelar</button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
