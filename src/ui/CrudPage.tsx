import { Plus, type LucideIcon } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { getDb } from "../db";
import type { Db } from "../db/types";
import { money, parseDecimal } from "../domain/format";
import ColorDots, { colorSwatch } from "./ColorDots";
import EmptyState from "./EmptyState";
import { fieldErrors } from "./fieldErrors";
import MassField from "./MassField";
import MoneyField from "./MoneyField";
import { formatMass, formatMoneyInput, parseMass, parseMoney } from "./parse";
import { takePendingOpen } from "./search";
import { modKey, onNewShortcut } from "./shortcuts";
import { errorText, useToast } from "./Toast";
import { useData } from "./useData";

export type Field = {
  key: string;
  label: string;
  /** mass = gramas, kg ou rolos (usa o campo spoolG do formulário, se houver). */
  kind: "text" | "number" | "money" | "select" | "color" | "mass";
  options?: readonly string[];
  placeholder?: string;
  hint?: string;
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
  /** Id da página (PAGES), para a busca abrir um registro direto em edição. */
  pageId: string;
  title: string;
  singular: string;
  /** Frase abaixo do título. */
  lead?: string;
  repo: Repo;
  fields: Field[];
  defaults: Record<string, string>;
  /** Campos que continuam preenchidos depois de adicionar (ex.: material e marca de vários rolos seguidos). */
  sticky?: string[];
  /** Ícone e frase do estado vazio. */
  empty: { icon: LucideIcon; text: string };
  isLow?: (r: Row) => boolean;
  restock?: { qtyLabel: string; priceLabel: string; defaultQty: (r: Row) => string | number; mass?: boolean };
};

const SKELETON_ROWS = 3;
/** Tempo para desfazer uma exclusão; só então o registro sai do banco. */
export const UNDO_MS = 8000;
const isNum = (f: Field) => f.kind === "number" || f.kind === "money" || f.kind === "mass";
const spoolOf = (v: Record<string, string | number>) => parseDecimal(String(v.spoolG ?? "")) || 1000;

function show(f: Field, r: Row) {
  const v = r[f.key];
  if (f.kind === "money") return money(Number(v));
  if (f.kind === "mass") return formatMass(Number(v));
  if (f.kind === "number") return Number(v).toLocaleString("pt-BR");
  if (f.kind === "color") {
    const hex = colorSwatch(String(v));
    return (
      <span className="swatch-inline">
        {hex && <i style={{ background: hex }} />}
        {v}
      </span>
    );
  }
  return v;
}

/** Texto do campo ao editar um registro existente. */
const toText = (f: Field, v: unknown) => (v == null ? "" : f.kind === "money" ? formatMoneyInput(String(v)) : String(v));

export default function CrudPage({ pageId, title, singular, lead, repo, fields, defaults, sticky = [], empty, isLow, restock }: Props) {
  const [rows, reload, loading] = useData((db) => repo.list(db), [] as Row[]);
  const [form, setForm] = useState(defaults);
  const [editing, setEditing] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restocking, setRestocking] = useState<{ id: number; qty: string; price: string } | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([key]) => key !== k))); // o erro some assim que a pessoa mexe no campo
  };
  const visible = rows.filter((r) => !hidden.has(r.id));

  function focusForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    formRef.current?.querySelector<HTMLElement>("input, select, button[role=radio]")?.focus({ preventScroll: true });
  }

  // Lista vazia: já deixa o cursor no primeiro campo. Cmd/Ctrl+N: novo cadastro.
  useEffect(() => {
    if (loading) return;
    const open = takePendingOpen(pageId);
    const row = open !== null ? rows.find((r) => r.id === open) : undefined;
    if (row) edit(row);
    else if (rows.length === 0) focusForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);
  useEffect(
    () =>
      onNewShortcut(() => {
        cancel();
        focusForm();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function toValues() {
    const v: Record<string, unknown> = {};
    for (const f of fields) {
      const t = String(form[f.key] ?? "");
      v[f.key] = f.kind === "money" ? parseMoney(t) : f.kind === "mass" ? parseMass(t, spoolOf(form)) : f.kind === "number" ? parseDecimal(t) : t;
    }
    return v;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const db = await getDb();
      if (editing === null) await repo.insert(db, toValues());
      else await repo.update(db, editing, toValues());
      toast(editing === null ? `${singular} cadastrado(a).` : "Alterações salvas.");
      const keep = editing === null ? Object.fromEntries(sticky.map((k) => [k, form[k]])) : {};
      setForm({ ...defaults, ...keep });
      setEditing(null);
      setErrors({});
      reload();
      if (editing === null) focusForm();
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
    setForm(Object.fromEntries(fields.map((f) => [f.key, toText(f, r[f.key])])));
    focusForm();
  }

  /** Esconde já e só apaga do banco depois do prazo de desfazer. */
  function remove(r: Row) {
    const name = String(r[fields[0].key]);
    setHidden((h) => new Set(h).add(r.id));
    if (editing === r.id) cancel();
    let undone = false;
    const timer = setTimeout(async () => {
      if (undone) return;
      try {
        await repo.remove(await getDb(), r.id);
        reload();
      } catch (e) {
        setHidden((h) => new Set([...h].filter((id) => id !== r.id)));
        toast(`Não foi possível excluir "${name}": ${errorText(e)}`, "error");
      }
    }, UNDO_MS);
    toast(`"${name}" excluído(a).`, "ok", {
      label: "Desfazer",
      onClick: () => {
        undone = true;
        clearTimeout(timer);
        setHidden((h) => new Set([...h].filter((id) => id !== r.id)));
      },
    });
  }

  async function confirmRestock(e: React.FormEvent) {
    e.preventDefault();
    if (!restocking || !repo.restock) return;
    const row = rows.find((r) => r.id === restocking.id);
    const qty = restock?.mass ? parseMass(restocking.qty, spoolOf(row ?? {})) : parseDecimal(restocking.qty);
    try {
      await repo.restock(await getDb(), restocking.id, qty, parseMoney(restocking.price));
      toast("Reposição registrada. Custo médio atualizado.");
      setRestocking(null);
      reload();
    } catch (err) {
      toast(errorText(err), "error");
    }
  }

  function input(f: Field) {
    const common = { label: f.label, value: form[f.key] ?? "", onChange: (v: string) => set(f.key, v), error: errors[f.key], hint: f.hint, placeholder: f.placeholder };
    if (f.kind === "money") return <MoneyField key={f.key} {...common} />;
    if (f.kind === "mass") return <MassField key={f.key} {...common} spoolG={spoolOf(form)} />;
    if (f.kind === "color")
      return (
        <div key={f.key} className="span-all">
          <ColorDots label={f.label} value={common.value} onChange={common.onChange} error={common.error} />
        </div>
      );
    return (
      <label key={f.key}>
        {f.label}
        {f.kind === "select" ? (
          <select value={common.value} onChange={(e) => set(f.key, e.target.value)}>
            {f.options?.map((o) => <option key={o}>{o}</option>)}
          </select>
        ) : (
          <input value={common.value} inputMode={f.kind === "text" ? "text" : "decimal"} placeholder={f.placeholder} aria-invalid={!!errors[f.key]} onChange={(e) => set(f.key, e.target.value)} />
        )}
        {errors[f.key] ? <span className="error">{errors[f.key]}</span> : f.hint && <span className="hint">{f.hint}</span>}
      </label>
    );
  }

  return (
    <div className="page">
      <h1>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
      <form ref={formRef} className="card" onSubmit={submit} noValidate>
        <h2 className="card-title">{editing === null ? `Adicionar ${singular.toLowerCase()}` : `Editar ${singular.toLowerCase()}`}</h2>
        <div className="grid">{fields.map(input)}</div>
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
          <span className="hint kbd-hint">
            <kbd>Enter</kbd> salva · <kbd>{modKey()}</kbd>+<kbd>N</kbd> novo
          </span>
        </div>
      </form>

      {loading ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }} aria-busy="true" aria-label="Carregando">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <span key={i} className="skeleton row" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      ) : visible.length === 0 ? (
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
            {visible.map((r) => (
              <Fragment key={r.id}>
                <tr className={editing === r.id ? "selected" : ""}>
                  {fields.map((f, i) => (
                    <td key={f.key} className={isNum(f) ? "num" : ""}>
                      {i === 0 ? <strong>{show(f, r)}</strong> : show(f, r)} {i === 0 && isLow?.(r) && <span className="badge">estoque baixo</span>}
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
                      <form className="row" onSubmit={confirmRestock}>
                        {restock.mass ? (
                          <MassField label={restock.qtyLabel} value={restocking.qty} spoolG={spoolOf(r)} onChange={(qty) => setRestocking({ ...restocking, qty })} />
                        ) : (
                          <label>
                            {restock.qtyLabel}
                            <input inputMode="decimal" value={restocking.qty} onChange={(e) => setRestocking({ ...restocking, qty: e.target.value })} />
                          </label>
                        )}
                        <MoneyField label={restock.priceLabel} autoFocus value={restocking.price} onChange={(price) => setRestocking({ ...restocking, price })} />
                        <button className="primary" type="submit">
                          Confirmar reposição
                        </button>
                        <button type="button" onClick={() => setRestocking(null)}>
                          Cancelar
                        </button>
                      </form>
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
