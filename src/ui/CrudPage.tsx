import { ask } from "@tauri-apps/plugin-dialog";
import { Plus, type LucideIcon } from "lucide-react";
import { Fragment, useRef, useState } from "react";
import { getDb } from "../db";
import type { Db } from "../db/types";
import { money, parseDecimal } from "../domain/format";
import EmptyState from "./EmptyState";
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
  /** Frase abaixo do título. */
  lead?: string;
  repo: Repo;
  fields: Field[];
  defaults: Record<string, string>;
  /** Ícone e frase do estado vazio. */
  empty: { icon: LucideIcon; text: string };
  isLow?: (r: Row) => boolean;
  restock?: { qtyLabel: string; priceLabel: string; defaultQty: (r: Row) => number };
};

const SKELETON_ROWS = 3;
const isNum = (f: Field) => f.kind === "number" || f.kind === "money";
const show = (f: Field, v: string | number) => (f.kind === "money" ? money(Number(v)) : f.kind === "number" ? Number(v).toLocaleString("pt-BR") : v);

export default function CrudPage({ title, singular, lead, repo, fields, defaults, empty, isLow, restock }: Props) {
  const [rows, reload, loading] = useData((db) => repo.list(db), [] as Row[]);
  const [form, setForm] = useState(defaults);
  const [editing, setEditing] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restocking, setRestocking] = useState<{ id: number; qty: string; price: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  function toValues() {
    const v: Record<string, unknown> = {};
    for (const f of fields) v[f.key] = isNum(f) ? parseDecimal(form[f.key] ?? "") : form[f.key];
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

  function focusForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    formRef.current?.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
  }

  function edit(r: Row) {
    setEditing(r.id);
    setErrors({});
    setForm(Object.fromEntries(fields.map((f) => [f.key, String(r[f.key] ?? "")])));
    focusForm();
  }

  async function remove(r: Row) {
    const name = r[fields[0].key];
    if (!(await ask(`Excluir "${name}"? Isso não pode ser desfeito.`, { title: "Confirmar exclusão", kind: "warning", okLabel: "Excluir", cancelLabel: "Cancelar" }))) return;
    try {
      await repo.remove(await getDb(), r.id);
      toast(`"${name}" excluído(a).`);
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
    <div className="page">
      <h1>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
      <form ref={formRef} className="card" onSubmit={submit} noValidate>
        <h2 className="card-title">{editing === null ? `Adicionar ${singular.toLowerCase()}` : `Editar ${singular.toLowerCase()}`}</h2>
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
        <div className="row" style={{ marginTop: 16 }}>
          <button className="primary" type="submit">
            {editing === null ? (
              <>
                <Plus aria-hidden /> Adicionar
              </>
            ) : (
              "Salvar alterações"
            )}
          </button>
          {editing !== null && (
            <button type="button" onClick={cancel}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }} aria-busy="true" aria-label="Carregando">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <span key={i} className="skeleton row" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={empty.icon} title="Nada cadastrado ainda." action={<button onClick={focusForm}>Cadastrar {singular.toLowerCase()}</button>}>
          {empty.text}
        </EmptyState>
      ) : (
        <table>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.key} className={isNum(f) ? "num" : ""}>
                  {f.label}
                </th>
              ))}
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className={editing === r.id ? "selected" : ""}>
                  {fields.map((f, i) => (
                    <td key={f.key} className={isNum(f) ? "num" : ""}>
                      {i === 0 ? <strong>{show(f, r[f.key])}</strong> : show(f, r[f.key])} {i === 0 && isLow?.(r) && <span className="badge">estoque baixo</span>}
                    </td>
                  ))}
                  <td className="num actions">
                    {restock && (
                      <button className="link" onClick={() => setRestocking({ id: r.id, qty: String(restock.defaultQty(r)), price: "" })}>
                        Repor
                      </button>
                    )}
                    <button className="link" onClick={() => edit(r)}>
                      Editar
                    </button>
                    <button className="link danger" onClick={() => remove(r)}>
                      Excluir
                    </button>
                  </td>
                </tr>
                {restock && restocking?.id === r.id && (
                  <tr className="restock">
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
                        <button className="primary" onClick={confirmRestock}>
                          Confirmar reposição
                        </button>
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
    </div>
  );
}
