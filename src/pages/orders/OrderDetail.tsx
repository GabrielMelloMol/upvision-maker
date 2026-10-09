import { ask } from "@tauri-apps/plugin-dialog";
import { ClipboardList, FileDown, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getDb } from "../../db";
import { ordersRepo, type HistoryEntry } from "../../db/ordersRepo";
import { applyStock } from "../../db/stock";
import { money } from "../../domain/format";
import { customCopies, lineTotal, orderTotals, STATUS_LABEL, STATUSES, type Order, type OrderItem, type OrderStatus } from "../../domain/orders";
import { loadPdfFonts } from "../../pdf/fonts";
import { orderConfirmationPdf } from "../../pdf/orderConfirmation";
import { openWith } from "../../tools/intent";
import { requestNavigate } from "../../ui/navigate";
import { printLogsRepo } from "../../db/printLogsRepo";
import { lastWorked, type PrintLog } from "../../domain/printLogs";
import PrintLogForm from "../products/PrintLogForm";
import { logLine } from "../products/PrintSheet";
import Button from "../../ui/Button";
import Sheet from "../../ui/Sheet";
import { saveFile, slug } from "../../ui/saveFile";
import { errorText, useToast } from "../../ui/Toast";
import PaymentBox from "./PaymentBox";
import type { OrdersData } from "./data";

const dateBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export async function moveOrder(order: Order, to: OrderStatus, data: OrdersData): Promise<void> {
  await ordersRepo.changeStatus(order, to, data, applyStock);
}

export default function OrderDetail({ order, data, onClose, onChanged, onEdit }: { order: Order; data: OrdersData; onClose: () => void; onChanged: () => void; onEdit: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // ficha de impressão (#163): o que funcionou em cada produto do pedido e o registro da impressão deste pedido
  const [logs, setLogs] = useState<PrintLog[]>([]);
  const [logging, setLogging] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const totals = orderTotals(order.items, order.freight);

  useEffect(() => {
    getDb()
      .then((db) => ordersRepo.history(db, order.id))
      .then(setHistory)
      .catch((e) => toast(`Erro ao carregar histórico: ${errorText(e)}`, "error"));
  }, [order.id, toast]);
  const reloadLogs = () => getDb().then(printLogsRepo.list).then(setLogs);
  useEffect(() => {
    getDb()
      .then(printLogsRepo.list)
      .then(setLogs)
      .catch((e) => toast(`Erro ao ler as fichas: ${errorText(e)}`, "error"));
  }, [toast]);
  const workedFor = (productId: number | null) => (productId ? lastWorked(logs.filter((l) => l.productId === productId)) : null);

  /**
   * "Preparar impressão" (#164): abre o modelo pronto do produto com a personalização do item no lote; o pedido
   * pendente passa para "Em produção" (com a baixa de estoque, como ao mover à mão).
   */
  async function prepare(item: OrderItem) {
    const modelId = data.products.find((p) => p.id === item.productId)?.modelId;
    if (!modelId) return;
    if (order.status === "pending") {
      try {
        await moveOrder(order, "production", data);
        toast(`Pedido #${order.id}: ${STATUS_LABEL.production}.`);
      } catch (e) {
        toast(`Não mudei o status: ${errorText(e)}`, "error");
      }
    }
    openWith("models", { id: modelId, batch: item.custom });
    requestNavigate("models");
  }

  async function move(to: OrderStatus) {
    if (to === "canceled" && !(await ask(`Cancelar o pedido #${order.id}?${order.stockApplied ? " O estoque volta automaticamente." : ""}`, { title: "Cancelar pedido", kind: "warning", okLabel: "Cancelar pedido", cancelLabel: "Voltar" }))) return;
    setBusy(true);
    try {
      await moveOrder(order, to, data);
      toast(`Pedido #${order.id}: ${STATUS_LABEL[to]}.`);
      onChanged();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  /** Confirmação do pedido em PDF (#185): o que o cliente recebe ao fechar a venda. */
  async function confirmationPdf() {
    try {
      const r = await orderConfirmationPdf(await loadPdfFonts(), data.company, order, data.customers.find((c) => c.id === order.customerId));
      const path = await saveFile(`pedido-${order.id}-${slug(order.customerName)}.pdf`, r.bytes, "pdf", "PDF");
      if (path) toast(r.pixError ? `PDF salvo sem o QR Pix (${r.pixError}) em ${path}` : `Confirmação salva em ${path}`, r.pixError ? "error" : "ok");
    } catch (e) {
      toast(`Não foi possível gerar o PDF: ${errorText(e)}`, "error");
    }
  }

  async function remove() {
    if (!(await ask(`Excluir o pedido #${order.id}?${order.stockApplied ? " O estoque volta automaticamente." : ""} Isso não pode ser desfeito.`, { title: "Excluir pedido", kind: "warning", okLabel: "Excluir pedido", cancelLabel: "Voltar" }))) return;
    try {
      await ordersRepo.remove(order, applyStock);
      toast(`Pedido #${order.id} excluído.`);
      onChanged();
    } catch (e) {
      toast(errorText(e), "error");
    }
  }

  const targets = order.status === "canceled" ? (["pending"] as OrderStatus[]) : STATUSES.filter((s) => s !== order.status);
  return (
    <Sheet
      wide
      title={`Pedido #${order.id} · ${order.customerName}`}
      icon={ClipboardList}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" className="danger" icon={Trash2} onClick={remove}>
            Excluir pedido
          </Button>
          <Button variant="secondary" icon={FileDown} onClick={() => void confirmationPdf()}>
            Confirmação em PDF
          </Button>
          <Button icon={Pencil} onClick={onEdit}>
            Editar
          </Button>
        </>
      }
    >
      <div className="metrics">
        <span>Status <b>{STATUS_LABEL[order.status]}</b></span>
        <span>Canal <b>{order.channel}</b></span>
        <span>Prazo <b>{dateBr(order.dueDate)}</b></span>
        <span>Pagamento <b>{order.paymentMethod || "—"}</b></span>
        {order.printerId && <span>Impressora <b>{data.printers.find((p) => p.id === order.printerId)?.name ?? "removida"}</b></span>}
        {order.deliveredAt && <span>Entregue em <b>{dateBr(order.deliveredAt)}</b></span>}
        <span>Estoque <b>{order.stockApplied ? "baixado" : "não baixado"}</b></span>
      </div>
      <PaymentBox order={order} data={data} onChanged={onChanged} />
      <div className="row" role="group" aria-label="Mudar status">
        {targets.map((s) => (
          <Button key={s} size="sm" variant={s === "canceled" ? "ghost" : "secondary"} className={s === "canceled" ? "danger" : ""} disabled={busy} onClick={() => move(s)}>
            {s === "pending" && order.status === "canceled" ? "Reabrir" : STATUS_LABEL[s]}
          </Button>
        ))}
      </div>
      <table>
        <thead>
          <tr><th>Item</th><th className="num">Qtd</th><th className="num">Preço</th><th className="num">Desc.</th><th className="num">Total</th></tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id}>
              <td>
                {i.description}
                {customCopies(i.custom).length > 0 && <span className="hint order-custom">{customCopies(i.custom).join(", ")}</span>}
                {data.products.find((p) => p.id === i.productId)?.modelId && (
                  <button type="button" className="link" onClick={() => void prepare(i)} disabled={busy}>
                    Preparar impressão
                  </button>
                )}
                {workedFor(i.productId) && (
                  <span className="hint order-custom">
                    Ficha: {logLine(workedFor(i.productId)!, data.printers) || "deu certo antes"}
                    {workedFor(i.productId)!.notes && ` · ${workedFor(i.productId)!.notes}`}
                  </span>
                )}
                {i.productId && logging !== i.id && (
                  <button type="button" className="link" onClick={() => setLogging(i.id)}>
                    Registrar impressão
                  </button>
                )}
                {i.productId && logging === i.id && (
                  <PrintLogForm
                    productId={i.productId}
                    orderId={order.id}
                    base={workedFor(i.productId)}
                    printers={data.printers}
                    onCancel={() => setLogging(null)}
                    onSaved={() => {
                      setLogging(null);
                      void reloadLogs();
                    }}
                  />
                )}
              </td>
              <td className="num">{i.qty.toLocaleString("pt-BR")}</td>
              <td className="num">{money(i.unitPrice)}</td>
              <td className="num">{i.discountPct ? `${i.discountPct.toLocaleString("pt-BR")}%` : "—"}</td>
              <td className="num">{money(lineTotal(i))}</td>
            </tr>
          ))}
          {totals.freight > 0 && <tr><td colSpan={4}>Frete</td><td className="num">{money(totals.freight)}</td></tr>}
          <tr><th colSpan={4}>Total</th><th className="num">{money(totals.total)}</th></tr>
        </tbody>
      </table>
      {order.notes && <p className="notes">{order.notes}</p>}
      <h3>Histórico</h3>
      <ol className="timeline">
        {history.map((h) => (
          <li key={h.id}>
            <span className="muted small">{h.at.slice(0, 16).replace(/(\d{4})-(\d{2})-(\d{2})/, "$3/$2/$1")}</span> {h.note || STATUS_LABEL[h.status as OrderStatus] || h.status}
          </li>
        ))}
      </ol>
    </Sheet>
  );
}
