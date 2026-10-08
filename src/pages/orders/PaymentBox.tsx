import { openUrl } from "@tauri-apps/plugin-opener";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { getDb } from "../../db";
import { ordersRepo } from "../../db/ordersRepo";
import { money } from "../../domain/format";
import { PAYMENT_LABEL, paymentOf, readyMessage, whatsappLink, type Order } from "../../domain/orders";
import Button from "../../ui/Button";
import MoneyField from "../../ui/MoneyField";
import { formatMoneyInput, parseMoney } from "../../ui/parse";
import { errorText, useToast } from "../../ui/Toast";
import type { OrdersData } from "./data";

/** Pagamento do pedido (#177): pago, com sinal ou a receber, e o aviso de pronto por WhatsApp com texto pronto. */
export default function PaymentBox({ order, data, onChanged }: { order: Order; data: OrdersData; onChanged: () => void }) {
  const pay = paymentOf(order);
  const [received, setReceived] = useState(pay.paid > 0 ? formatMoneyInput(String(pay.paid)) : "");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const phone = data.customers.find((c) => c.id === order.customerId)?.phone ?? "";
  const link = whatsappLink(phone, readyMessage(order, data.company.tradeName || data.company.name));

  async function save(amount: number) {
    setBusy(true);
    try {
      await ordersRepo.setPaid(await getDb(), order, amount);
      toast(amount >= pay.total && pay.total > 0 ? `Pedido #${order.id}: pago.` : `Pedido #${order.id}: ${money(Math.min(amount, pay.total))} recebido.`);
      onChanged();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  function saveTyped() {
    const v = received.trim() === "" ? 0 : parseMoney(received);
    if (!Number.isFinite(v) || v < 0) return setError("Digite o valor já recebido, ex.: 30,00.");
    setError(undefined);
    void save(v);
  }

  return (
    <section className="payment-box" aria-label="Pagamento">
      <div className="row">
        <span className={pay.state === "paid" ? "badge ok" : "badge"}>{PAYMENT_LABEL[pay.state]}</span>
        <span className="small">
          Recebido <b>{money(pay.paid)}</b> de <b>{money(pay.total)}</b>
          {pay.due > 0 && <> · falta <b>{money(pay.due)}</b></>}
        </span>
      </div>
      {order.status !== "canceled" && (
        <div className="row">
          <MoneyField label="Valor recebido até agora" value={received} onChange={setReceived} error={error} />
          <Button size="sm" disabled={busy} onClick={saveTyped}>
            Salvar valor recebido
          </Button>
          {pay.state !== "paid" && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void save(pay.total)}>
              Marcar como pago
            </Button>
          )}
        </div>
      )}
      {(order.status === "done" || order.status === "delivered") && (
        <div className="row">
          <Button size="sm" variant="secondary" icon={MessageCircle} disabled={!link} onClick={() => link && void openUrl(link).catch((e) => toast(errorText(e), "error"))}>
            Avisar que está pronto no WhatsApp
          </Button>
          {!link && <span className="hint">{order.customerId ? "O cliente não tem telefone com DDD cadastrado." : "Escolha um cliente cadastrado, com telefone, para avisar por WhatsApp."}</span>}
        </div>
      )}
    </section>
  );
}
