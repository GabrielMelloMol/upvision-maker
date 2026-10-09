import { PackagePlus } from "lucide-react";
import { useState } from "react";
import { getDb } from "../../db";
import { consignmentsRepo } from "../../db/consignmentsRepo";
import { ordersRepo } from "../../db/ordersRepo";
import { applyStock } from "../../db/stock";
import { nextRestock, restockTotal, type Consignment, type ConsignmentItem } from "../../domain/consignments";
import { money, parseDecimal } from "../../domain/format";
import { RESALE, todayIso } from "../../domain/orders";
import { productPricing } from "../../domain/products";
import { loadPdfFonts } from "../../pdf/fonts";
import { restockPdf } from "../../pdf/restock";
import Button from "../../ui/Button";
import SmartField from "../../ui/SmartField";
import { saveFile, slug } from "../../ui/saveFile";
import Sheet from "../../ui/Sheet";
import { errorText, useToast } from "../../ui/Toast";
import type { QuotesData } from "./data";

const dateBr = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Registra a reposição de um consignado (#184): vira um pedido da loja pelo valor de repasse, em produção (com a baixa de
 * estoque), marca a data para o prazo da próxima e, se pedido, salva o termo de reposição em PDF para a loja assinar.
 */
export default function RestockSheet({ consignment: c, data, onClose, onDone }: { consignment: Consignment; data: QuotesData; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState(c.items.map((i) => String(i.qty).replace(".", ",")));
  const [withPdf, setWithPdf] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const items: ConsignmentItem[] = c.items.map((i, k) => ({ ...i, qty: parseDecimal(qty[k]) }));
  const valid = items.every((i) => Number.isFinite(i.qty) && i.qty >= 0) && items.some((i) => i.qty > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const sent = items.filter((i) => i.qty > 0);
    const today = todayIso();
    setBusy(true);
    try {
      const db = await getDb();
      const id = await ordersRepo.create(db, {
        customerId: c.customerId,
        customerName: c.customerName,
        channel: RESALE,
        dueDate: null,
        paymentMethod: "",
        notes: `Reposição de consignado (contrato desde ${dateBr(c.startDate)})`,
        freight: 0,
        items: sent.map((i) => {
          const p = data.products.find((x) => x.id === i.productId);
          let unitCost = 0;
          try {
            if (p) unitCost = productPricing(p, data).result.unitCost;
          } catch {
            // kit com problema: o custo fica 0 e dá para ajustar no pedido
          }
          return { productId: i.productId, description: i.name, qty: i.qty, unitPrice: i.transferPrice, discountPct: 0, unitCost, printMinutes: p ? p.printMinutes / p.piecesPerPlate : 0, custom: "" };
        }),
      });
      let stockNote = "";
      try {
        const order = (await ordersRepo.list(db)).find((o) => o.id === id);
        if (order) await ordersRepo.changeStatus(order, "production", data, applyStock);
      } catch (err) {
        stockNote = ` Não baixei o estoque (${errorText(err)}): confira no pedido #${id}.`;
      }
      await consignmentsRepo.restocked(db, c.id, today);
      toast(`Reposição registrada: pedido #${id}.${stockNote}`, stockNote ? "error" : "ok");
      if (withPdf) {
        const customer = data.customers.find((x) => x.id === c.customerId);
        const { bytes } = await restockPdf(await loadPdfFonts(), data.company, c, customer, sent, today, nextRestock({ ...c, lastRestockAt: today }));
        const path = await saveFile(`reposicao-${slug(c.customerName)}-${today}.pdf`, bytes, "pdf", "PDF");
        if (path) toast(`Termo salvo em ${path}`);
      }
      onDone();
    } catch (err) {
      toast(`Não foi possível registrar: ${errorText(err)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`Reposição · ${c.customerName}`}
      icon={PackagePlus}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="action" type="submit" disabled={busy || !valid}>
            Registrar reposição
          </Button>
        </>
      }
    >
      <div className="stack">
        {c.items.map((i, k) => (
          <div className="row line" key={k}>
            <span className="grow">{i.name}</span>
            <SmartField label="Qtd a repor" inputMode="decimal" parse={parseDecimal} invalidText="Digite a quantidade, ex.: 20." value={qty[k]} onChange={(v) => setQty(qty.map((q, j) => (j === k ? v : q)))} />
            <span className="muted small">repasse {money(i.transferPrice)}</span>
          </div>
        ))}
        <span className="hint">Total em repasse: {money(restockTotal(items.map((i) => ({ ...i, qty: Number.isFinite(i.qty) ? i.qty : 0 }))))}. Vira um pedido de Revenda em produção, com a baixa do estoque.</span>
        <label className="check">
          <input type="checkbox" checked={withPdf} onChange={(e) => setWithPdf(e.target.checked)} /> Salvar o termo de reposição em PDF para a loja assinar
        </label>
      </div>
    </Sheet>
  );
}
