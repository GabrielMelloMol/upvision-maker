import { z } from "zod";
import { ClipboardList, Plus } from "lucide-react";
import { useState } from "react";
import { getDb } from "../../db";
import { ordersRepo } from "../../db/ordersRepo";
import { money, parseDecimal } from "../../domain/format";
import { CONSUMER, lineTotal, orderTotals, priceForChannel, RESALE, type Order, type OrderInput } from "../../domain/orders";
import { productPricing } from "../../domain/products";
import Alert from "../../ui/Alert";
import Button from "../../ui/Button";
import { fieldErrors } from "../../ui/fieldErrors";
import MoneyField from "../../ui/MoneyField";
import { formatMoneyInput, parseMoney } from "../../ui/parse";
import Sheet from "../../ui/Sheet";
import { errorText, useToast } from "../../ui/Toast";
import type { OrdersData } from "./data";

export const PAYMENT_METHODS = ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Transferência", "Pago no marketplace", "A combinar"];

type Line = { productId: string; description: string; qty: string; unitPrice: string; discountPct: string; manualPrice: boolean };

const str = (n: number) => String(n).replace(".", ",");
const num = (s: string) => parseDecimal(s);
/** Preço no formato do campo de R$ ("15,00"). */
const brl = (n: number) => formatMoneyInput(String(n));

type Props = {
  data: OrdersData;
  order?: Order;
  /** Rascunho vindo de um orçamento. */
  draft?: Partial<OrderInput>;
  onClose: () => void;
  onSaved: (id: number) => void;
  /** Salvar do rascunho chama isto em vez de criar (ex.: orçamento). */
  saveAs?: (input: OrderInput) => Promise<number>;
  title?: string;
  submitLabel?: string;
  /** Campos extras no fim do formulário (ex.: validade do orçamento). */
  children?: React.ReactNode;
};

/** Formulário de pedido (também usado pelo orçamento): cliente, canal, prazo, itens com desconto e frete. */
export default function OrderEditor({ data, order, draft, onClose, onSaved, saveAs, title, submitLabel, children }: Props) {
  const base = order ?? draft ?? {};
  const [customerId, setCustomerId] = useState(base.customerId ? String(base.customerId) : "");
  const [customerName, setCustomerName] = useState(base.customerName ?? "");
  const [channel, setChannel] = useState(base.channel ?? CONSUMER);
  const [dueDate, setDueDate] = useState(base.dueDate ?? "");
  const [payment, setPayment] = useState(base.paymentMethod ?? "Pix");
  const [notes, setNotes] = useState(base.notes ?? "");
  const [freight, setFreight] = useState(base.freight ? brl(base.freight) : "");
  const [lines, setLines] = useState<Line[]>(
    (base.items ?? []).map((i) => ({ productId: i.productId ? String(i.productId) : "", description: i.description, qty: str(i.qty), unitPrice: brl(i.unitPrice), discountPct: str(i.discountPct), manualPrice: true })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const channels = [CONSUMER, RESALE, ...data.settings.channels.map((c) => c.name)];
  const customer = data.customers.find((c) => String(c.id) === customerId);
  const defaultDiscount = customer ? str(customer.discountPct) : "0";

  function suggested(productId: string, ch: string) {
    const p = data.products.find((x) => String(x.id) === productId);
    if (!p) return null;
    try {
      return priceForChannel(p, productPricing(p, data).result, ch);
    } catch {
      return null;
    }
  }

  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function pickProduct(i: number, productId: string) {
    const p = data.products.find((x) => String(x.id) === productId);
    const price = suggested(productId, channel);
    update(i, { productId, description: p?.name ?? lines[i].description, unitPrice: price === null ? lines[i].unitPrice : brl(price), manualPrice: false });
  }

  function changeChannel(ch: string) {
    setChannel(ch);
    // preços que não foram digitados à mão acompanham o canal
    setLines(lines.map((l) => {
      const price = !l.manualPrice && l.productId ? suggested(l.productId, ch) : null;
      return price === null ? l : { ...l, unitPrice: brl(price) };
    }));
  }

  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = data.customers.find((x) => String(x.id) === id);
    if (c) {
      setCustomerName(c.name);
      setLines(lines.map((l) => ({ ...l, discountPct: l.discountPct === "" || l.discountPct === "0" ? str(c.discountPct) : l.discountPct })));
    }
  }

  const costOf = (p: (typeof data.products)[number]) => {
    try {
      return productPricing(p, data).result.unitCost;
    } catch {
      return 0; // kit circular: o editor de produto já avisa
    }
  };
  const items = lines.map((l) => {
    const p = data.products.find((x) => String(x.id) === l.productId);
    const unitCost = p ? costOf(p) : 0;
    return {
      productId: p ? p.id : null,
      description: l.description,
      qty: num(l.qty),
      unitPrice: parseMoney(l.unitPrice),
      discountPct: num(l.discountPct) || 0,
      unitCost,
      printMinutes: p ? p.printMinutes / p.piecesPerPlate : 0,
    };
  });
  const input: OrderInput = {
    customerId: customer ? customer.id : null,
    customerName: customerName.trim(),
    channel,
    dueDate: dueDate || null,
    paymentMethod: payment,
    notes,
    freight: parseMoney(freight) || 0,
    items,
  };
  const valid = items.every((i) => Number.isFinite(i.qty) && Number.isFinite(i.unitPrice));
  const totals = valid ? orderTotals(items, input.freight) : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let id: number;
      if (saveAs) id = await saveAs(input);
      else if (order) {
        await ordersRepo.update(await getDb(), order, input);
        id = order.id;
      } else id = await ordersRepo.create(await getDb(), input);
      if (!saveAs) toast(order ? "Pedido atualizado." : `Pedido #${id} criado.`);
      onSaved(id);
    } catch (err) {
      const fe = fieldErrors(err);
      const item = itemError(err);
      setErrors(item ? { ...fe, items: item } : fe);
      if (fe._) toast(errorText(err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      wide
      title={title ?? (order ? `Pedido #${order.id}` : "Novo pedido")}
      icon={ClipboardList}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {submitLabel ?? (order ? "Salvar alterações" : "Criar pedido")}
          </Button>
        </>
      }
    >
      <div className="grid">
        <label>
          Cliente cadastrado
          <select value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
            <option value="">Nenhum (digitar nome)</option>
            {data.customers
              .filter((c) => c.active || String(c.id) === customerId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Nome do cliente
          <input data-autofocus value={customerName} maxLength={120} aria-invalid={!!errors.customerName} onChange={(e) => setCustomerName(e.target.value)} />
          {errors.customerName && <span className="error">{errors.customerName}</span>}
        </label>
        <label>
          Canal
          <select value={channel} onChange={(e) => changeChannel(e.target.value)}>
            {channels.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Prazo de entrega
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <label>
          Pagamento
          <select value={payment} onChange={(e) => setPayment(e.target.value)}>
            {[...new Set([...PAYMENT_METHODS, payment])].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="plain">
        <legend>Itens</legend>
        <div className="stack">
          {lines.map((l, i) => (
            <div className="row line order-line" key={i}>
              <label>
                Produto
                <select value={l.productId} onChange={(e) => pickProduct(i, e.target.value)}>
                  <option value="">Item avulso</option>
                  {data.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grow">
                Descrição
                <input value={l.description} maxLength={200} onChange={(e) => update(i, { description: e.target.value })} />
              </label>
              <label className="narrow">Qtd<input inputMode="decimal" value={l.qty} onChange={(e) => update(i, { qty: e.target.value })} /></label>
              <div className="money">
                <MoneyField label="Preço un." value={l.unitPrice} onChange={(v) => update(i, { unitPrice: v, manualPrice: true })} />
              </div>
              <label className="narrow">Desc. %<input inputMode="decimal" value={l.discountPct} onChange={(e) => update(i, { discountPct: e.target.value })} /></label>
              <span className="num line-total">{Number.isFinite(items[i].qty) && Number.isFinite(items[i].unitPrice) ? money(lineTotal(items[i])) : "—"}</span>
              <button type="button" className="link danger" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                Remover
              </button>
            </div>
          ))}
          <Button size="sm" icon={Plus} onClick={() => setLines([...lines, { productId: "", description: "", qty: "1", unitPrice: "", discountPct: defaultDiscount, manualPrice: false }])}>
            Adicionar item
          </Button>
          {errors.items && <span className="error">{errors.items}</span>}
        </div>
      </fieldset>

      <div className="grid">
        <MoneyField label="Frete cobrado" value={freight} onChange={setFreight} />
        <label className="span2">
          Observações (cor, acabamento, personalização)
          <textarea value={notes} maxLength={2000} rows={2} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      {children}
      {totals && (
        <table className="totals">
          <tbody>
            <tr><td>Subtotal</td><td className="num">{money(totals.subtotal)}</td></tr>
            {totals.discount > 0 && <tr><td>Descontos</td><td className="num">− {money(totals.discount)}</td></tr>}
            {totals.freight > 0 && <tr><td>Frete</td><td className="num">{money(totals.freight)}</td></tr>}
            <tr><th>Total</th><th className="num">{money(totals.total)}</th></tr>
          </tbody>
        </table>
      )}
      {order?.stockApplied && <Alert kind="info">O estoque deste pedido já foi baixado: para mudar produtos ou quantidades, volte-o para Pendente.</Alert>}
    </Sheet>
  );
}

const ITEM_FIELD: Record<string, string> = { description: "descrição", qty: "quantidade", unitPrice: "preço", discountPct: "desconto", unitCost: "custo" };

/** Erro num campo de um item ("Item 2 — preço: …"); null se o erro não for de um item específico. */
function itemError(err: unknown): string | null {
  if (!(err instanceof z.ZodError)) return null;
  const issue = err.issues.find((i) => i.path[0] === "items" && typeof i.path[1] === "number");
  if (!issue) return null;
  const msg = fieldErrors(new z.ZodError([{ ...issue, path: ["x"] }])).x;
  const field = ITEM_FIELD[String(issue.path[2])];
  return `Item ${Number(issue.path[1]) + 1}${field ? ` — ${field}` : ""}: ${msg}`;
}
