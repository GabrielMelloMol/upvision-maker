import { ask } from "@tauri-apps/plugin-dialog";
import { Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { useState } from "react";
import { getDb } from "../db";
import { costsRepo } from "../db/costsRepo";
import { printers } from "../db/repo";
import type { Db } from "../db/types";
import type { Printer } from "../domain/entities";
import { money } from "../domain/format";
import { FREQUENCIES, FREQUENCY_LABEL, monthlyRecurring, type OperationalCost, type OperationalCostInput } from "../domain/finance";
import { todayIso } from "../domain/orders";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import { fieldErrors } from "../ui/fieldErrors";
import MoneyField from "../ui/MoneyField";
import { formatMoneyInput, parseMoney } from "../ui/parse";
import Sheet from "../ui/Sheet";
import { errorText, useToast } from "../ui/Toast";
import { useData } from "../ui/useData";

const load = async (db: Db) => ({ costs: await costsRepo.list(db), printers: await printers.list(db) });
const CATEGORIES = ["Aluguel", "Energia fixa", "Internet", "Salários", "Impostos", "Máquinas (parcelas)", "Marketing", "Assinaturas", "Outros"];
const dateBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

export default function Costs() {
  const [data, reload] = useData(load, { costs: [] as OperationalCost[], printers: [] as Printer[] });
  const [editing, setEditing] = useState<Partial<OperationalCost> | null>(null);
  const toast = useToast();
  const monthly = monthlyRecurring(data.costs, todayIso());

  async function remove(c: OperationalCost) {
    if (!(await ask(`Excluir "${c.description}"?`, { title: "Excluir custo", kind: "warning", okLabel: "Excluir custo", cancelLabel: "Cancelar" }))) return;
    try {
      await costsRepo.remove(await getDb(), c.id);
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Custos operacionais</h1>
          <p className="lead">Aluguel, impostos, parcelas da impressora… Entram no Financeiro nas datas em que acontecem.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
          Novo custo
        </Button>
      </div>
      {data.costs.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhum custo cadastrado" action={<Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Cadastrar custo</Button>}>
          Cadastre os custos fixos para o lucro do Financeiro ficar real.
        </EmptyState>
      ) : (
        <>
          <p className="muted">Custos recorrentes ativos: cerca de <b>{money(monthly)}</b> por mês.</p>
          <table>
            <thead><tr><th>Descrição</th><th>Categoria</th><th>Frequência</th><th>Período</th><th className="num">Valor</th><th /></tr></thead>
            <tbody>
              {data.costs.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.description}</b>
                    {c.printerId && <div className="muted small">{data.printers.find((p) => p.id === c.printerId)?.name}</div>}
                  </td>
                  <td>{c.category}</td>
                  <td>{FREQUENCY_LABEL[c.frequency]}</td>
                  <td>{c.frequency === "once" ? dateBr(c.startDate) : `desde ${dateBr(c.startDate)}${c.endDate ? ` até ${dateBr(c.endDate)}` : ""}`}</td>
                  <td className="num">{money(c.amount)}</td>
                  <td>
                    <div className="list-actions">
                      <Button variant="ghost" size="sm" icon={Pencil} aria-label={`Editar ${c.description}`} onClick={() => setEditing(c)} />
                      <Button variant="ghost" size="sm" icon={Trash2} className="danger" aria-label={`Excluir ${c.description}`} onClick={() => remove(c)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {editing && <CostSheet initial={editing} printerList={data.printers} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), reload())} />}
    </div>
  );
}

function CostSheet({ initial, printerList, onClose, onSaved }: { initial: Partial<OperationalCost>; printerList: Printer[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({
    description: initial.description ?? "",
    category: initial.category ?? "",
    amount: initial.amount ? formatMoneyInput(String(initial.amount)) : "",
    frequency: initial.frequency ?? ("monthly" as OperationalCostInput["frequency"]),
    startDate: initial.startDate ?? todayIso(),
    endDate: initial.endDate ?? "",
    printerId: initial.printerId ? String(initial.printerId) : "",
    notes: initial.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const input = { ...v, amount: parseMoney(v.amount), endDate: v.frequency === "once" || !v.endDate ? null : v.endDate, printerId: v.printerId ? Number(v.printerId) : null };
    try {
      const db = await getDb();
      if (initial.id) await costsRepo.update(db, initial.id, input);
      else await costsRepo.insert(db, input);
      toast("Custo salvo.");
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
    }
  }

  const err = (k: string) => errors[k] && <span className="error">{errors[k]}</span>;
  return (
    <Sheet
      title={initial.id ? "Editar custo" : "Novo custo"}
      icon={Receipt}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit">Salvar custo</Button>
        </>
      }
    >
      <div className="grid">
        <label>
          Descrição
          <input data-autofocus value={v.description} maxLength={120} aria-invalid={!!errors.description} onChange={set("description")} />
          {err("description")}
        </label>
        <label>
          Categoria
          <input list="cost-categories" value={v.category} maxLength={60} onChange={set("category")} />
          <datalist id="cost-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <MoneyField label="Valor" value={v.amount} error={errors.amount} onChange={(amount) => setV((cur) => ({ ...cur, amount }))} />
        <label>
          Frequência
          <select value={v.frequency} onChange={set("frequency")}>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
          </select>
        </label>
        <label>
          {v.frequency === "once" ? "Data" : "Começa em"}
          <input type="date" value={v.startDate} onChange={set("startDate")} />
        </label>
        {v.frequency !== "once" && (
          <label>
            Termina em (opcional)
            <input type="date" value={v.endDate} onChange={set("endDate")} />
            <span className="hint">Ex.: última parcela</span>
          </label>
        )}
        <label>
          Impressora (opcional)
          <select value={v.printerId} onChange={set("printerId")}>
            <option value="">Nenhuma</option>
            {printerList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <label>Observações<textarea rows={2} maxLength={500} value={v.notes} onChange={set("notes")} /></label>
      {errors._ && <p className="error">{errors._}</p>}
    </Sheet>
  );
}
