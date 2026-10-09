import { FileSignature } from "lucide-react";
import { useState } from "react";
import { getDb } from "../../db";
import { consignmentsRepo } from "../../db/consignmentsRepo";
import { money, parseDecimal } from "../../domain/format";
import MoneyField from "../../ui/MoneyField";
import SmartField from "../../ui/SmartField";
import { parseMoney } from "../../ui/parse";
import { todayIso } from "../../domain/orders";
import { productPricing, salePrice } from "../../domain/products";
import { contractPdf, DEFAULT_TERMS, type ContractTerms } from "../../pdf/contract";
import { loadPdfFonts } from "../../pdf/fonts";
import Alert from "../../ui/Alert";
import Button from "../../ui/Button";
import { saveFile, slug } from "../../ui/saveFile";
import Sheet from "../../ui/Sheet";
import { errorText, useToast } from "../../ui/Toast";
import type { QuotesData } from "./data";

type Row = { productId: number; qty: string; transfer: string; sale: string };
const str = (n: number) => n.toFixed(2).replace(".", ",");

/** Contrato de consignação: loja parceira + peças com repasse (do cadastro do produto) + cláusulas editáveis. */
export default function ContractSheet({ data, onClose, onSaved }: { data: QuotesData; onClose: () => void; onSaved: () => void }) {
  const [customerId, setCustomerId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [t, setT] = useState<ContractTerms>(DEFAULT_TERMS(todayIso()));
  const [track, setTrack] = useState(true); // acompanhar a reposição na lista de Consignados (#184)
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const customer = data.customers.find((c) => String(c.id) === customerId);

  function add(productId: string) {
    const p = data.products.find((x) => String(x.id) === productId);
    if (!p) return;
    let transfer = p.consignmentPrice ?? 0;
    let sale = p.manualPrice ?? 0;
    try {
      const r = productPricing(p, data).result;
      transfer = p.consignmentPrice ?? r.resale;
      sale = salePrice(p, r);
    } catch {
      // kit com problema: a pessoa digita os valores
    }
    setRows([...rows, { productId: p.id, qty: "1", transfer: str(transfer), sale: str(sale) }]);
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return toast("Escolha o consignatário (cliente).", "error");
    if (!valid) return;
    setBusy(true);
    try {
      const items = rows.map((r) => ({ name: data.products.find((p) => p.id === r.productId)?.name ?? "Peça", qty: parseDecimal(r.qty), transferPrice: parseMoney(r.transfer), salePrice: parseMoney(r.sale) }));
      const { bytes } = await contractPdf(await loadPdfFonts(), data.company, customer, items, t);
      const path = await saveFile(`consignacao-${slug(customer.name)}-${t.date}.pdf`, bytes, "pdf", "PDF");
      if (path) {
        toast(`Contrato salvo em ${path}`);
        if (track) {
          const db = await getDb();
          await consignmentsRepo.create(db, {
            customerId: customer.id,
            customerName: customer.name,
            startDate: t.date,
            periodDays: t.periodDays,
            items: rows.map((r, k) => ({ productId: r.productId, name: items[k].name, qty: items[k].qty, transferPrice: items[k].transferPrice, salePrice: items[k].salePrice })),
            notes: "",
          }, todayIso());
          onSaved();
        }
        onClose();
      }
    } catch (err) {
      toast(`Não foi possível gerar: ${errorText(err)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  // M10: valor ilegível não vira R$ 0,00 no PDF; precisa de quantidade > 0 e valores em R$ legíveis
  const valid = rows.every((r) => parseDecimal(r.qty) > 0 && parseMoney(r.transfer) >= 0 && parseMoney(r.sale) >= 0);
  const upd = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Sheet
      wide
      title="Contrato de consignação"
      icon={FileSignature}
      onClose={onClose}
      onSubmit={generate}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="action" type="submit" disabled={busy || !rows.length || !customer || !valid}>
            Salvar PDF do contrato
          </Button>
        </>
      }
    >
      <div className="grid">
        <label>
          Consignatário (loja parceira)
          <select data-autofocus value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Escolha um cliente</option>
            {data.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data
          <input type="date" value={t.date} onChange={(e) => setT({ ...t, date: e.target.value })} />
        </label>
        <label>
          Prazo (dias)
          <input inputMode="numeric" value={t.periodDays} onChange={(e) => setT({ ...t, periodDays: Number(e.target.value) || 0 })} />
        </label>
      </div>
      <fieldset className="plain">
        <legend>Peças</legend>
        <div className="stack">
          {rows.map((r, i) => (
            <div className="row line" key={i}>
              <span className="grow">{data.products.find((p) => p.id === r.productId)?.name}</span>
              <SmartField label="Qtd" inputMode="decimal" parse={parseDecimal} invalidText="Digite a quantidade, ex.: 20." value={r.qty} onChange={(v) => upd(i, { qty: v })} />
              <MoneyField label="Repasse (R$)" value={r.transfer} onChange={(v) => upd(i, { transfer: v })} />
              <MoneyField label="Preço sugerido (R$)" value={r.sale} onChange={(v) => upd(i, { sale: v })} />
              <button type="button" className="link danger" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                Remover
              </button>
            </div>
          ))}
          <label>
            Adicionar produto
            <select value="" onChange={(e) => add(e.target.value)}>
              <option value="">Escolha…</option>
              {data.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {rows.length > 0 && (
            <span className="hint">
              Total em repasse: {money(rows.reduce((s, r) => s + (parseDecimal(r.qty) || 0) * (parseMoney(r.transfer) || 0), 0))}. O repasse vem do cadastro do produto (ou do preço de revenda).
            </span>
          )}
        </div>
      </fieldset>
      <fieldset className="plain">
        <legend>Cláusulas (edite se quiser)</legend>
        <div className="stack">
          <label>Acerto<textarea rows={2} value={t.settlement} onChange={(e) => setT({ ...t, settlement: e.target.value })} /></label>
          <label>Preço<textarea rows={2} value={t.commissionNote} onChange={(e) => setT({ ...t, commissionNote: e.target.value })} /></label>
          <label>Perdas e danos<textarea rows={2} value={t.losses} onChange={(e) => setT({ ...t, losses: e.target.value })} /></label>
          <label>Devolução<textarea rows={2} value={t.returns} onChange={(e) => setT({ ...t, returns: e.target.value })} /></label>
        </div>
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} /> Acompanhar a reposição (aviso de prazo na lista de Consignados)
      </label>
      <Alert kind="info">Modelo simples. Não substitui orientação jurídica.</Alert>
    </Sheet>
  );
}
