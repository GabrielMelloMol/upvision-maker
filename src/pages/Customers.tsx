import { ask } from "@tauri-apps/plugin-dialog";
import { Pencil, Plus, Trash2, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { getDb } from "../db";
import { customersRepo } from "../db/customersRepo";
import { parseDecimal } from "../domain/format";
import { EMPTY_CUSTOMER, formatDocument, type Customer, type CustomerInput } from "../domain/customers";
import "../styles/features.css";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import { fieldErrors } from "../ui/fieldErrors";
import Segmented from "../ui/Segmented";
import Sheet from "../ui/Sheet";
import { errorText, useToast } from "../ui/Toast";
import { takePendingOpen } from "../ui/search";
import { useData } from "../ui/useData";
import AddressFields from "./customers/AddressFields";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Customers() {
  const [list, reload] = useData(customersRepo.list, [] as Customer[]);
  const data = list;
  const [editingState, setEditingState] = useState<Partial<Customer> | null>(null);
  const [searchId, setSearchId] = useState(() => takePendingOpen("customers")); // vindo da busca global
  const editing = editingState ?? (searchId !== null ? (data.find((c) => c.id === searchId) ?? null) : null);
  const setEditing = (c: Partial<Customer> | null) => {
    setSearchId(null);
    setEditingState(c);
  };
  const [query, setQuery] = useState("");
  const toast = useToast();
  const q = norm(query.trim());
  const shown = q ? list.filter((c) => norm([c.name, c.phone, c.email, c.instagram, c.city, c.document].join(" ")).includes(q)) : list;

  async function remove(c: Customer) {
    if (!(await ask(`Excluir "${c.name}"? Pedidos antigos continuam com o nome.`, { title: "Excluir cliente", kind: "warning", okLabel: "Excluir cliente", cancelLabel: "Cancelar" }))) return;
    try {
      await customersRepo.remove(await getDb(), c.id);
      reload();
    } catch (e) {
      toast(`Não foi possível excluir: ${errorText(e)}`, "error");
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Clientes</h1>
          <p className="lead">Contato, endereço e desconto padrão, que já entra nos pedidos e orçamentos.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
          Novo cliente
        </Button>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum cliente ainda" action={<Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Cadastrar cliente</Button>} />
      ) : (
        <>
          <label style={{ maxWidth: 360 }}>
            Buscar
            <input type="search" value={query} placeholder="Nome, telefone, cidade…" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contato</th>
                <th>Cidade</th>
                <th className="num">Desconto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className={c.active ? "" : "muted"}>
                  <td>
                    <b>{c.name}</b> {!c.active && <span className="badge">inativo</span>}
                    {c.document && <div className="muted small">{formatDocument(c.document)}</div>}
                  </td>
                  <td>{[c.phone, c.email, c.instagram && `@${c.instagram.replace(/^@/, "")}`].filter(Boolean).join(" · ")}</td>
                  <td>{[c.city, c.uf].filter(Boolean).join("/")}</td>
                  <td className="num">{c.discountPct ? `${c.discountPct.toLocaleString("pt-BR")}%` : "—"}</td>
                  <td>
                    <div className="list-actions">
                      <Button variant="ghost" size="sm" icon={Pencil} aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)} />
                      <Button variant="ghost" size="sm" icon={Trash2} className="danger" aria-label={`Excluir ${c.name}`} onClick={() => remove(c)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="muted">Nenhum cliente encontrado para “{query}”.</p>}
        </>
      )}
      {editing && (
        <CustomerSheet
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

export function CustomerSheet({ initial, onClose, onSaved }: { initial: Partial<Customer>; onClose: () => void; onSaved: (id: number) => void }) {
  const [v, setV] = useState<CustomerInput>({ ...EMPTY_CUSTOMER, ...initial });
  const [discount, setDiscount] = useState(String(initial.discountPct ?? 0).replace(".", ","));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const set = (k: keyof CustomerInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const db = await getDb();
      const input = { ...v, discountPct: parseDecimal(discount) || 0 };
      let id = initial.id;
      if (id) await customersRepo.update(db, id, input);
      else id = await customersRepo.insert(db, input);
      toast(initial.id ? "Cliente atualizado." : "Cliente cadastrado.");
      onSaved(id);
    } catch (err) {
      setErrors(fieldErrors(err));
    }
  }

  const err = (k: string) => errors[k] && <span className="error">{errors[k]}</span>;
  return (
    <Sheet
      wide
      title={initial.id ? `Editar ${initial.name}` : "Novo cliente"}
      icon={UserRound}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit">
            {initial.id ? "Salvar alterações" : "Cadastrar cliente"}
          </Button>
        </>
      }
    >
      <Segmented
        label="Tipo"
        value={v.kind}
        options={[
          ["pf", "Pessoa física"],
          ["pj", "Empresa"],
        ]}
        onChange={(kind) => setV({ ...v, kind })}
      />
      <div className="grid">
        <label>
          Nome
          <input data-autofocus value={v.name} maxLength={120} aria-invalid={!!errors.name} onChange={set("name")} />
          {err("name")}
        </label>
        <label>
          {v.kind === "pj" ? "CNPJ" : "CPF"} (opcional)
          <input inputMode="numeric" value={v.document} maxLength={20} aria-invalid={!!errors.document} onChange={set("document")} />
          {err("document")}
        </label>
        <label>WhatsApp / telefone<input inputMode="tel" value={v.phone} maxLength={30} onChange={set("phone")} /></label>
        <label>
          E-mail
          <input type="email" value={v.email} maxLength={120} aria-invalid={!!errors.email} onChange={set("email")} />
          {err("email")}
        </label>
        <label>Instagram<input value={v.instagram} maxLength={60} onChange={set("instagram")} /></label>
        <label>
          Desconto padrão (%)
          <input inputMode="decimal" value={discount} aria-invalid={!!errors.discountPct} onChange={(e) => setDiscount(e.target.value)} />
          {err("discountPct")}
        </label>
      </div>
      <fieldset className="plain">
        <legend>Endereço</legend>
        <AddressFields value={v} onChange={setV} />
      </fieldset>
      <label>
        Observações
        <textarea value={v.notes} maxLength={1000} rows={2} onChange={set("notes")} />
      </label>
      <label className="check">
        <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Cliente ativo
      </label>
      {errors._ && <p className="error">{errors._}</p>}
    </Sheet>
  );
}
