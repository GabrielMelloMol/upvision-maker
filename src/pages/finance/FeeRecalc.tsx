import { useState } from "react";
import { getDb } from "../../db";
import { ordersRepo } from "../../db/ordersRepo";
import { byChannel, totalFees, totalSales, type FeeFix } from "../../domain/feeRecalc";
import { money } from "../../domain/format";
import type { Order } from "../../domain/orders";
import Button from "../../ui/Button";
import { errorText, useToast } from "../../ui/Toast";

type Props = { fixes: FeeFix[]; orders: Order[]; onDone: () => void };

/**
 * Pedidos entregues sem taxa do canal (#246): o lucro deles aparece maior do que foi. Mostra quanto seria pelas regras de
 * hoje de cada canal e só grava depois do "Recalcular".
 */
export default function FeeRecalc({ fixes, orders, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!fixes.length) return null;
  const rows = byChannel(fixes);
  const pctOf = (fees: number, sales: number) => (sales > 0 ? ` (${Math.round((fees / sales) * 100)}% do vendido)` : "");
  const apply = async () => {
    setBusy(true);
    try {
      const db = await getDb();
      await ordersRepo.setFees(db, fixes.map((f) => ({ id: f.id, status: orders.find((o) => o.id === f.id)?.status ?? "delivered", fees: f.fees })));
      toast(`Taxas recalculadas em ${fixes.length} ${fixes.length === 1 ? "pedido" : "pedidos"}: ${money(totalFees(fixes))} a mais em taxas.`);
      setOpen(false);
      onDone();
    } catch (e) {
      toast(`Não consegui recalcular as taxas: ${errorText(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card fee-recalc" aria-label="Taxas faltando nos pedidos antigos">
      <p>
        <b>{fixes.length} {fixes.length === 1 ? "pedido entregue está" : "pedidos entregues estão"} sem a taxa do canal</b>, então o lucro deles aparece maior do que foi. Dá para recalcular pelas regras de hoje de cada canal.
      </p>
      {!open ? (
        <Button variant="action" onClick={() => setOpen(true)}>
          Recalcular taxas dos pedidos antigos
        </Button>
      ) : (
        <>
          <ul className="fee-recalc-list">
            {rows.map((r) => (
              <li key={r.channel}>
                {r.channel}: {r.orders} {r.orders === 1 ? "pedido" : "pedidos"}, {money(r.sales)} vendidos → taxas de {money(r.fees)}
                {pctOf(r.fees, r.sales)}
              </li>
            ))}
          </ul>
          <p className="hint">Total: {money(totalSales(fixes))} vendidos → {money(totalFees(fixes))} em taxas e imposto, que sairão do lucro. A taxa fixa vale por unidade vendida. São as regras de hoje, não as da data da venda: confira os canais nas Preferências antes. Pedidos que já têm taxa não mudam.</p>
          <div className="row">
            <Button variant="primary" disabled={busy} onClick={apply}>
              Recalcular {fixes.length} {fixes.length === 1 ? "pedido" : "pedidos"}
            </Button>
            <button type="button" className="link" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </section>
  );
}
